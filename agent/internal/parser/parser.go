package parser

import (
	"encoding/json"
	"regexp"
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

	// Expected/auth errors that should never be tracked or alerted on.
	ignorePatterns = []*regexp.Regexp{
		regexp.MustCompile(`\b401\b`),
		regexp.MustCompile(`\b403\b`),
		regexp.MustCompile(`(?i)not authenticated`),
		regexp.MustCompile(`(?i)unauthorized`),
		regexp.MustCompile(`(?i)forbidden`),
		regexp.MustCompile(`(?i)authentication required`),
		regexp.MustCompile(`(?i)invalid token`),
		regexp.MustCompile(`(?i)not authorized`),
	}

	exceptionPattern = regexp.MustCompile(`(?i)^(\w+(?:\.\w+)*(?:Error|Exception|Panic|Fault))`)

	// file.py:123 or file.go:123
	stackFramePattern = regexp.MustCompile(`\b([\w/\-\.]+\.\w+):(\d+)`)
)

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

func extractStackFrames(line string) []StackFrame {
	matches := stackFramePattern.FindAllStringSubmatch(line, 10)
	var frames []StackFrame
	for _, m := range matches {
		if len(m) >= 3 {
			lineNum := 0
			for _, c := range m[2] {
				lineNum = lineNum*10 + int(c-'0')
			}
			frames = append(frames, StackFrame{
				File: m[1],
				Line: lineNum,
			})
		}
	}
	return frames
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
