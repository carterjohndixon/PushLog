package parser

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type StackFrame struct {
	File     string `json:"file"`
	Function string `json:"function,omitempty"`
	Line     int    `json:"line,omitempty"`
}

type InboundEvent struct {
	Source        string            `json:"source"`
	Service       string            `json:"service"`
	Environment   string            `json:"environment"`
	Timestamp     string            `json:"timestamp"`
	Severity      string            `json:"severity"`
	ExceptionType string            `json:"exception_type"`
	Message       string            `json:"message"`
	Stacktrace    []StackFrame      `json:"stacktrace"`
	Tags          map[string]string `json:"tags,omitempty"`
}

var (
	severityPatterns = []struct {
		level   string
		pattern *regexp.Regexp
	}{
		{"critical", regexp.MustCompile(`(?i)\b(fatal|panic|critical)\b`)},
		{"error", regexp.MustCompile(`(?i)\b(error|err|exception|traceback|fail(ed|ure)?)\b`)},
		{"warning", regexp.MustCompile(`(?i)\b(warn(ing)?)\b`)},
	}

	// Expected/auth errors and self-referential logs that should never be tracked or alerted on.
	ignorePatterns = []*regexp.Regexp{
		regexp.MustCompile(`\b401\b`),
		regexp.MustCompile(`\b403\b`),
		regexp.MustCompile(`\b404\b`),
		regexp.MustCompile(`(?i)not authenticated`),
		regexp.MustCompile(`(?i)unauthorized`),
		regexp.MustCompile(`(?i)forbidden`),
		regexp.MustCompile(`(?i)authentication required`),
		regexp.MustCompile(`(?i)invalid token`),
		regexp.MustCompile(`(?i)not authorized`),
		// Avoid feedback loop: incident engine's own log output
		regexp.MustCompile(`\[incident-engine\]\s+incident`),
	}

	exceptionPattern = regexp.MustCompile(`(?i)^(\w+(?:\.\w+)*(?:Error|Exception|Panic|Fault))`)

	// Stack frame patterns for different runtimes (order matters: more specific first).
	// Node: at functionName (path/file.ts:123:45) — use .+? so path stops before :line
	stackNodeAtFn   = regexp.MustCompile(`at\s+(\S+)\s+\((.+?):(\d+)(?::(\d+))?\)`)
	stackNodeAtFile = regexp.MustCompile(`at\s+([\w/\-\.]+\.\w+):(\d+)(?::(\d+))?`)
	// Python: File "path", line N, in function
	stackPython = regexp.MustCompile(`File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+(\w+))?`)
	// Java: at package.Class.method(File.java:123)
	stackJava = regexp.MustCompile(`at\s+(?:\w+(?:\.\w+)*\.)?(\w+)\s*\(([\w\-\./]+\.(?:java|kt|scala)):(\d+)\)`)
	// Go / generic: path/file.go:123 or path/to/module (no extension)
	stackFileLine   = regexp.MustCompile(`\b([\w/\-\.]+\.\w+):(\d+)`)
	stackGoNoExt    = regexp.MustCompile(`\b([\w/\-\.]+/[\w\-\.]+):(\d+)`)
	// Generic: (file:line)
	stackParens = regexp.MustCompile(`\(([\w/\-\.]+\.\w+):(\d+)\)`)

	// Docker/PM2 log prefixes to strip before stack detection (order matters)
	// Docker: 2024-03-07T05:27:00.123456789Z
	// PM2: 0|app-name  | or 0|app-name  | 2024-03-07...
	logPrefixRe = regexp.MustCompile(`^(?:\d+\|[^\s|]+\s*\|\s*)?(?:\d{4}-\d{2}-\d{2}T[\d:.]+Z?\s*)?`)
)

// stripLogPrefix removes Docker/PM2 prefixes so stack detection works on the actual content.
func stripLogPrefix(line string) string {
	return strings.TrimSpace(logPrefixRe.ReplaceAllString(line, ""))
}

// JournaldEntry represents a subset of journalctl -o json fields.
type JournaldEntry struct {
	Message             string `json:"MESSAGE"`
	Priority            string `json:"PRIORITY"`
	SyslogIdentifier    string `json:"SYSLOG_IDENTIFIER"`
	Unit                string `json:"_SYSTEMD_UNIT"`
	RealtimeTimestamp    string `json:"__REALTIME_TIMESTAMP"` // microseconds since epoch
}

func ParseLine(line, service, environment string) *InboundEvent {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil
	}
	if MatchesIgnorePattern(line) {
		return nil
	}

	severity := classifySeverity(line)
	if severity == "" {
		return nil
	}

	exType := extractExceptionType(line)
	if exType == "" {
		exType = strings.Title(severity)
	}

	msg := line
	if len(msg) > 8192 {
		msg = msg[:8192]
	}

	frames := extractStackFrames(line)
	if len(frames) == 0 {
		frames = []StackFrame{{File: "log"}}
	}

	return &InboundEvent{
		Source:        "agent",
		Service:       service,
		Environment:   environment,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		Severity:      severity,
		ExceptionType: exType,
		Message:       msg,
		Stacktrace:    frames,
	}
}

func ParseJournaldLine(raw []byte, service, environment string) *InboundEvent {
	var entry JournaldEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		return ParseLine(string(raw), service, environment)
	}

	msg := strings.TrimSpace(entry.Message)
	if msg == "" {
		return nil
	}
	if MatchesIgnorePattern(msg) {
		return nil
	}

	severity := classifySeverity(msg)
	if severity == "" {
		severity = journaldPriorityToSeverity(entry.Priority)
	}
	if severity == "" {
		return nil
	}

	exType := extractExceptionType(msg)
	if exType == "" {
		exType = strings.Title(severity)
	}

	if len(msg) > 8192 {
		msg = msg[:8192]
	}

	frames := extractStackFrames(msg)
	if len(frames) == 0 {
		frames = []StackFrame{{File: "log"}}
	}

	ts := time.Now().UTC().Format(time.RFC3339)

	return &InboundEvent{
		Source:        "agent",
		Service:       service,
		Environment:   environment,
		Timestamp:     ts,
		Severity:      severity,
		ExceptionType: exType,
		Message:       msg,
		Stacktrace:    frames,
	}
}

// MatchesIgnorePattern returns true if the line matches noise patterns (401, 403, auth errors) and would not be shipped.
func MatchesIgnorePattern(line string) bool {
	for _, re := range ignorePatterns {
		if re.MatchString(line) {
			return true
		}
	}
	return false
}

func classifySeverity(line string) string {
	for _, sp := range severityPatterns {
		if sp.pattern.MatchString(line) {
			return sp.level
		}
	}
	return ""
}

func extractExceptionType(line string) string {
	m := exceptionPattern.FindStringSubmatch(line)
	if len(m) > 1 {
		return m[1]
	}
	return ""
}

func parseInt(s string) int {
	n := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
		}
	}
	return n
}

func extractStackFrames(line string) []StackFrame {
	line = stripLogPrefix(line)
	if line == "" {
		return nil
	}
	seen := make(map[string]bool)
	var frames []StackFrame
	add := func(f StackFrame) {
		key := f.File + ":" + strconv.Itoa(f.Line)
		if seen[key] {
			return
		}
		seen[key] = true
		frames = append(frames, f)
	}

	// Node: at functionName (path/file.ts:123:45)
	for _, m := range stackNodeAtFn.FindAllStringSubmatch(line, 20) {
		if len(m) >= 4 {
			add(StackFrame{File: m[2], Function: m[1], Line: parseInt(m[3])})
		}
	}
	// Node: at path/file.ts:123
	for _, m := range stackNodeAtFile.FindAllStringSubmatch(line, 20) {
		if len(m) >= 3 {
			add(StackFrame{File: m[1], Line: parseInt(m[2])})
		}
	}
	// Python: File "path", line N, in function
	for _, m := range stackPython.FindAllStringSubmatch(line, 20) {
		if len(m) >= 3 {
			f := StackFrame{File: m[1], Line: parseInt(m[2])}
			if len(m) >= 4 && m[3] != "" {
				f.Function = m[3]
			}
			add(f)
		}
	}
	// Java: at package.Class.method(File.java:123)
	for _, m := range stackJava.FindAllStringSubmatch(line, 20) {
		if len(m) >= 4 {
			add(StackFrame{File: m[2], Function: m[1], Line: parseInt(m[3])})
		}
	}
	// Generic: (file:line)
	for _, m := range stackParens.FindAllStringSubmatch(line, 20) {
		if len(m) >= 3 {
			add(StackFrame{File: m[1], Line: parseInt(m[2])})
		}
	}
	// file.ext:line
	for _, m := range stackFileLine.FindAllStringSubmatch(line, 20) {
		if len(m) >= 3 {
			add(StackFrame{File: m[1], Line: parseInt(m[2])})
		}
	}
	// Go path without extension: path/to/module:123
	for _, m := range stackGoNoExt.FindAllStringSubmatch(line, 20) {
		if len(m) >= 3 {
			add(StackFrame{File: m[1], Line: parseInt(m[2])})
		}
	}
	return frames
}

// IsStackLikeLine returns true if the line looks like a stack frame (for multi-line buffering).
func IsStackLikeLine(line string) bool {
	trimmed := stripLogPrefix(line)
	if trimmed == "" {
		return false
	}
	// Node: "    at ..."
	// Python: "  File ..."
	// Java: "    at ..."
	// Go: "path/file.go:123"
	return strings.HasPrefix(trimmed, "at ") ||
		strings.HasPrefix(trimmed, "File ") ||
		strings.HasPrefix(trimmed, "  File ") ||
		stackFileLine.MatchString(trimmed) ||
		stackGoNoExt.MatchString(trimmed) ||
		stackParens.MatchString(trimmed) ||
		stackJava.MatchString(trimmed)
}

// ParseLines parses a multi-line block (e.g. full stack trace) into one event.
// The first line must have severity; subsequent stack-like lines are merged into the stacktrace.
func ParseLines(lines []string, service, environment string) *InboundEvent {
	if len(lines) == 0 {
		return nil
	}
	first := strings.TrimSpace(lines[0])
	if first == "" {
		return nil
	}
	ev := ParseLine(first, service, environment)
	if ev == nil {
		return nil
	}
	// Merge frames from subsequent stack-like lines
	var allFrames []StackFrame
	seen := make(map[string]bool)
	addFrame := func(f StackFrame) {
		key := f.File + ":" + strconv.Itoa(f.Line)
		if seen[key] {
			return
		}
		seen[key] = true
		allFrames = append(allFrames, f)
	}
	for _, f := range ev.Stacktrace {
		addFrame(f)
	}
	for i := 1; i < len(lines); i++ {
		l := strings.TrimSpace(lines[i])
		if l == "" {
			continue
		}
		if !IsStackLikeLine(l) {
			// Append to message and stop collecting
			ev.Message += "\n" + l
			break
		}
		for _, f := range extractStackFrames(l) {
			addFrame(f)
		}
	}
	if len(allFrames) > 0 {
		ev.Stacktrace = allFrames
	}
	if len(ev.Message) > 8192 {
		ev.Message = ev.Message[:8192]
	}
	return ev
}

func journaldPriorityToSeverity(p string) string {
	switch p {
	case "0", "1", "2": // emerg, alert, crit
		return "critical"
	case "3": // err
		return "error"
	case "4": // warning
		return "warning"
	default:
		return ""
	}
}
