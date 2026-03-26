package parser

import (
	"strings"
	"testing"
)

func TestParseLine_DockerDaemonFiltered(t *testing.T) {
	dockerCli := []string{
		`Error response from daemon: No such container: pushlog-prod-web`,
		`ERROR RESPONSE FROM DAEMON: no such container: foo`,
		`Cannot connect to the Docker daemon at unix:///var/run/docker.sock`,
	}
	for _, line := range dockerCli {
		if ParseLine(line, "app", "prod", NoisePresetGeneric) != nil {
			t.Errorf("expected nil (docker CLI noise) for %q", line)
		}
	}
}

func TestParseLine_NoiseFiltered_GenericPreset(t *testing.T) {
	noise := []string{
		// Auth/expected status codes
		`Error: GET /api/notifications/all 401 in 5ms :: {"error":"Not authenticated"}`,
		`GET /foo 403 Forbidden`,
		`Unauthorized: invalid token`,
		`Authentication required`,
		`403 Forbidden`,
		`Not authorized to access resource`,

		// API request log lines (the #1 source of false positives)
		`GET /api/agents 200 in 134ms :: [{"id":"09fa0c41","name":"PushLog-March-8-2026","status":"active"}]`,
		`POST /api/test/simulate-incident 200 in 45ms :: {"ok":true}`,
		`DELETE /api/agents/75149a0b 404 in 7ms :: {"error":"Agent not found"}`,
		`GET /api/notifications/all 200 in 22ms :: {"count":5}`,
		`PUT /api/repositories/abc123 200 in 30ms :: {"ok":true}`,
		`GET /api/test/agent-correlation 500 in 5ms :: {"error":"Agent correlation test"}`,

		`serving on port 5001`,
		`[pushlog-agent] Starting pushlog-agent`,

		// Session/MFA
		`Session expired`,
		`MFA not configured`,
		`Invalid code`,
	}
	for _, line := range noise {
		ev := ParseLine(line, "test", "prod", NoisePresetGeneric)
		if ev != nil {
			t.Errorf("expected nil (filtered) for %q, got severity=%s", line, ev.Severity)
		}
	}
}

func TestParseLine_NoiseFiltered_PushlogAPIPreset(t *testing.T) {
	noise := []string{
		`[incident-engine] incident inc-abc123 (new_issue) app/production: New issue`,
		`[incident-engine] stdout parse error: unexpected token`,
		`[incident-engine] flush write failed: broken pipe`,
		`[incident] GitHub correlation failed (non-blocking): network timeout`,
		`incident-engine: read error: EOF`,
		`[risk-engine] Timeout, using fallback`,
		`[sentry-apps] validation failed`,
		`[webhooks/sentry] test: no target users for orgId=? service=app`,
		`[broadcastNotification] Write failed for user abc123: ERR_STREAM`,
		`[agentBuffer] ingest failed for event: Error: engine not ready`,
		`⚠️ ENCRYPTION_KEY is missing. Add it to .env`,
		`❌ Auth failed: { hasSession: true, hasUserId: false }`,
		`GitHub token validation error: TypeError: fetch failed`,
		`GitHub OAuth error from callback: { error: 'bad_verification_code' }`,
		`Failed to exchange code for token: Error: GitHub OAuth error: The code passed is incorrect or expired.`,
		`Failed to exchange code for token: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
		`172.69.23.109 - - [26/Mar/2026:17:55:15 +0000] "GET /login?error=Token%20exchange%20failed.%20Please%20try%20again. HTTP/1.1" 200 956`,
		`Error: [Symbol(undici.error.UND_ERR_CONNECT_TIMEOUT)]: true`,
	}
	for _, line := range noise {
		ev := ParseLine(line, "test", "prod", NoisePresetPushlogAPI)
		if ev != nil {
			t.Errorf("expected nil (pushlog_api filtered) for %q, got severity=%s", line, ev.Severity)
		}
	}
}

func TestParseLine_GenericPreset_ShipsGitHubFetchErrors(t *testing.T) {
	// Customer apps often integrate with GitHub; do not drop these under generic preset.
	line := `GitHub token validation error: TypeError: fetch failed`
	ev := ParseLine(line, "api", "prod", NoisePresetGeneric)
	if ev == nil {
		t.Fatal("expected event under generic preset")
	}
	if ev.Severity != "error" {
		t.Errorf("want severity error, got %q", ev.Severity)
	}
}

func TestParseLine_ProcessOutputExceptionType(t *testing.T) {
	// "Error " + word (not "Error:") avoids duplicate "Error: Error ..." in incident titles.
	line := `Error something broke in worker`
	ev := ParseLine(line, "api", "prod", NoisePresetGeneric)
	if ev == nil {
		t.Fatal("expected event")
	}
	if ev.ExceptionType != "ProcessOutput" {
		t.Errorf("want ExceptionType ProcessOutput, got %q", ev.ExceptionType)
	}
}

func TestParseLine_RealErrorsShipped(t *testing.T) {
	tests := []struct {
		line     string
		severity string
	}{
		{"Error: Cannot read property 'id' of undefined", "error"},
		{"Fatal: database connection refused", "critical"},
		{"panic: nil pointer dereference", "critical"},
		{"[WARN] Connection timeout", "warning"},
		{"exception: division by zero at main.go:42", "error"},
	}
	for _, tt := range tests {
		ev := ParseLine(tt.line, "api", "prod", NoisePresetGeneric)
		if ev == nil {
			t.Errorf("expected event for %q, got nil", tt.line)
			continue
		}
		if ev.Severity != tt.severity {
			t.Errorf("line %q: want severity=%s, got %s", tt.line, tt.severity, ev.Severity)
		}
	}
}

func TestParseLine_NoSeveritySkipped(t *testing.T) {
	skipped := []string{
		"INFO request completed",
		"DEBUG parsing config",
		"Something happened successfully",
	}
	for _, line := range skipped {
		ev := ParseLine(line, "test", "prod", NoisePresetGeneric)
		if ev != nil {
			t.Errorf("expected nil (no severity) for %q, got severity=%s", line, ev.Severity)
		}
	}
}

func TestParseLine_StackFrameExtraction(t *testing.T) {
	line := "Error at src/handlers/user.ts:42 in handleRequest"
	ev := ParseLine(line, "api", "prod", NoisePresetGeneric)
	if ev == nil {
		t.Fatal("expected event")
	}
	if len(ev.Stacktrace) == 0 {
		t.Fatal("expected stack frames")
	}
	found := false
	for _, f := range ev.Stacktrace {
		if f.File == "src/handlers/user.ts" && f.Line == 42 {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected handler.ts:42 in stacktrace, got %+v", ev.Stacktrace)
	}
}

func TestMatchesIgnorePattern(t *testing.T) {
	if !MatchesIgnorePattern("401 Unauthorized") {
		t.Error("401 should match")
	}
	if !MatchesIgnorePattern("Not authenticated") {
		t.Error("Not authenticated should match")
	}
	if MatchesIgnorePattern("Error: something broke") {
		t.Error("generic error should not match")
	}
}

func TestParseLine_NodeStackFrame(t *testing.T) {
	line := `Error: Cannot read property 'id' of undefined
    at handleRequest (src/handlers/user.ts:42:15)
    at Layer (node_modules/express/lib/router/layer.js:123)`
	ev := ParseLine(line, "api", "prod", NoisePresetGeneric)
	if ev == nil {
		t.Fatal("expected event")
	}
	if len(ev.Stacktrace) == 0 {
		t.Fatal("expected stack frames")
	}
	var found bool
	for _, f := range ev.Stacktrace {
		if f.File == "src/handlers/user.ts" && f.Line == 42 && f.Function == "handleRequest" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected handleRequest at src/handlers/user.ts:42, got %+v", ev.Stacktrace)
	}
}

func TestParseLine_PythonStackFrame(t *testing.T) {
	line := `Traceback (most recent call last):
  File "/app/main.py", line 42, in handle_request
    result = process(data)`
	ev := ParseLine(line, "api", "prod", NoisePresetGeneric)
	if ev == nil {
		t.Fatal("expected event")
	}
	var found bool
	for _, f := range ev.Stacktrace {
		if strings.Contains(f.File, "main.py") && f.Line == 42 && f.Function == "handle_request" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected handle_request at /app/main.py:42, got %+v", ev.Stacktrace)
	}
}

func TestParseLine_GoStackFrame(t *testing.T) {
	line := "panic: nil pointer dereference\n\t/Users/dev/app/internal/handler.go:123"
	ev := ParseLine(line, "api", "prod", NoisePresetGeneric)
	if ev == nil {
		t.Fatal("expected event")
	}
	var found bool
	for _, f := range ev.Stacktrace {
		if (f.File == "handler.go" || strings.HasSuffix(f.File, "handler.go")) && f.Line == 123 {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected handler.go:123, got %+v", ev.Stacktrace)
	}
}

func TestParseLine_JavaStackFrame(t *testing.T) {
	line := `Exception in thread "main" java.lang.NullPointerException
    at com.example.Main.process(Main.java:42)
    at com.example.App.run(App.java:100)`
	ev := ParseLine(line, "api", "prod", NoisePresetGeneric)
	if ev == nil {
		t.Fatal("expected event")
	}
	var found bool
	for _, f := range ev.Stacktrace {
		if f.File == "Main.java" && f.Line == 42 && f.Function == "process" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected process at Main.java:42, got %+v", ev.Stacktrace)
	}
}

func TestParseLines_MultiLine(t *testing.T) {
	lines := []string{
		"Error: connection refused",
		"    at connect (src/db.ts:100)",
		"    at initDb (src/index.ts:50)",
	}
	ev := ParseLines(lines, "api", "prod", NoisePresetGeneric)
	if ev == nil {
		t.Fatal("expected event")
	}
	if ev.Message != "Error: connection refused" {
		t.Errorf("expected message 'Error: connection refused', got %q", ev.Message)
	}
	if len(ev.Stacktrace) < 2 {
		t.Errorf("expected at least 2 stack frames, got %d: %+v", len(ev.Stacktrace), ev.Stacktrace)
	}
}

func TestIsStackLikeLine(t *testing.T) {
	stackLike := []string{
		"    at handleRequest (src/handler.ts:42)",
		"  File \"/app/main.py\", line 42, in foo",
		"    at com.example.Foo.bar(Foo.java:123)",
		"src/handler.go:123",
		// Docker/PM2 prefixed lines (stripLogPrefix must handle these)
		"2024-03-07T05:27:00.123456789Z     at handleRequest (src/handlers/user.ts:42:10)",
		"0|app  | 2024-03-07T05:27:00Z     at Layer (node_modules/express/lib/router/layer.js:152)",
	}
	for _, line := range stackLike {
		if !IsStackLikeLine(line) {
			t.Errorf("expected IsStackLikeLine(%q) = true", line)
		}
	}
	notStackLike := []string{
		"",
		"INFO request completed",
		"Something else",
	}
	for _, line := range notStackLike {
		if IsStackLikeLine(line) {
			t.Errorf("expected IsStackLikeLine(%q) = false", line)
		}
	}
}

func TestParseLines_DockerPrefixedStack(t *testing.T) {
	// Simulate Docker/PM2 log prefixes — stack frames must be detected after stripping.
	lines := []string{
		"Error: Test stack trace from agent",
		"2024-03-07T05:27:00.123456789Z     at handleRequest (src/handlers/user.ts:42:10)",
		"0|app  | 2024-03-07T05:27:00.123Z     at Layer (node_modules/express/lib/router/layer.js:152)",
	}
	ev := ParseLines(lines, "app", "production", NoisePresetGeneric)
	if ev == nil {
		t.Fatal("expected event")
	}
	if len(ev.Stacktrace) < 2 {
		t.Errorf("expected at least 2 stack frames (Docker prefix stripped), got %d: %+v", len(ev.Stacktrace), ev.Stacktrace)
	}
	var found bool
	for _, f := range ev.Stacktrace {
		if f.File == "src/handlers/user.ts" && f.Line == 42 && f.Function == "handleRequest" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected handleRequest at src/handlers/user.ts:42, got %+v", ev.Stacktrace)
	}
}
