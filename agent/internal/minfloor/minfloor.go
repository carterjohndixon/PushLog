package minfloor

import (
	"strings"
	"sync"

	"github.com/pushlog/pushlog-agent/internal/severity"
)

// Gate holds the effective min severity: optional PushLog-dashboard override (remote) over local YAML (file).
type Gate struct {
	mu   sync.RWMutex
	file string // normalized
	remote string // normalized; empty means use file
}

func New(fileMinFromYaml string) *Gate {
	return &Gate{file: severity.NormalizeMin(fileMinFromYaml)}
}

// SetFromDashboard applies heartbeat payload: nil min_severity JSON clears override (use file).
func (g *Gate) SetFromDashboard(minSeverity *string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if minSeverity == nil {
		g.remote = ""
		return
	}
	v := strings.TrimSpace(strings.ToLower(*minSeverity))
	switch v {
	case "warning", "error", "critical":
		g.remote = v
	default:
		g.remote = ""
	}
}

// Effective returns the floor used for shipping (remote wins when set).
func (g *Gate) Effective() string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	if g.remote != "" {
		return g.remote
	}
	return g.file
}
