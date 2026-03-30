package severity

import "strings"

// Rank maps agent/server severities for comparison (higher = more urgent).
// Parser emits: warning | error | critical (log "fatal" / "panic" → critical).
func Rank(s string) int {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "warning":
		return 1
	case "error":
		return 2
	case "critical":
		return 3
	default:
		return 0
	}
}

// MeetsMinimum is true if actual is at least as severe as minimum (e.g. error meets "error", critical meets "critical").
func MeetsMinimum(actual, minimum string) bool {
	return Rank(actual) >= Rank(minimum)
}
