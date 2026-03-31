package severity

import "testing"

func TestMeetsMinimum(t *testing.T) {
	if !MeetsMinimum("critical", "critical") {
		t.Fatal("critical should meet critical")
	}
	if !MeetsMinimum("error", "warning") {
		t.Fatal("error should meet warning")
	}
	if MeetsMinimum("warning", "error") {
		t.Fatal("warning should not meet error")
	}
	if MeetsMinimum("error", "critical") {
		t.Fatal("error should not meet critical")
	}
}

func TestNormalizeMin(t *testing.T) {
	if NormalizeMin("") != "warning" || NormalizeMin("  ") != "warning" || NormalizeMin("bogus") != "warning" {
		t.Fatal("invalid should default to warning")
	}
	if NormalizeMin("CRITICAL") != "critical" {
		t.Fatal("should lowercase")
	}
}
