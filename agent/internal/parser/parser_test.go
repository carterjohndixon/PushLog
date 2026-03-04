package parser

import (
	"testing"
)

func TestParseLine_NoiseFiltered(t *testing.T) {
	noise := []string{
		`Error: GET /api/notifications/all 401 in 5ms :: {"error":"Not authenticated"}`,
		`GET /foo 403 Forbidden`,
		`Unauthorized: invalid token`,
		`Authentication required`,
		`403 Forbidden`,
		`Not authorized to access resource`,
		`Error: [incident-engine] incident inc-abc123 (new_issue) app/production: New issue`,
	}
	for _, line := range noise {
		ev := ParseLine(line, "test", "prod")
		if ev != nil {
			t.Errorf("expected nil (filtered) for %q, got severity=%s", line, ev.Severity)
		}
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
		ev := ParseLine(tt.line, "api", "prod")
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
		ev := ParseLine(line, "test", "prod")
		if ev != nil {
			t.Errorf("expected nil (no severity) for %q, got severity=%s", line, ev.Severity)
		}
	}
}

func TestParseLine_StackFrameExtraction(t *testing.T) {
	line := "Error at src/handlers/user.ts:42 in handleRequest"
	ev := ParseLine(line, "api", "prod")
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
