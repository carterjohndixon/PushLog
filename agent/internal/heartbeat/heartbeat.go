package heartbeat

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/pushlog/pushlog-agent/internal/config"
	"github.com/pushlog/pushlog-agent/internal/minfloor"
)

const (
	Interval    = 30 * time.Second
	HTTPTimeout = 10 * time.Second
)

type payload struct {
	Hostname    string   `json:"hostname"`
	Arch        string   `json:"arch"`
	Environment string   `json:"environment"`
	Sources     []string `json:"sources"`
}

// Run sends a heartbeat every 30s until ctx is cancelled.
// gate is updated from JSON agent_config.min_severity when the server includes it.
func Run(ctx context.Context, cfg *config.Config, gate *minfloor.Gate) {
	client := &http.Client{Timeout: HTTPTimeout}
	endpoint := cfg.Endpoint + "/api/ingest/heartbeat"

	var sourceNames []string
	for _, s := range cfg.Sources {
		switch s.Type {
		case "file":
			sourceNames = append(sourceNames, s.Path)
		case "journald":
			sourceNames = append(sourceNames, "journald:"+s.Unit)
		case "docker":
			sourceNames = append(sourceNames, "docker:"+s.Container)
		}
	}

	body := payload{
		Hostname:    config.Hostname(),
		Arch:        config.Arch(),
		Environment: cfg.Environment,
		Sources:     sourceNames,
	}

	send := func() {
		data, _ := json.Marshal(body)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
		if err != nil {
			log.Printf("[heartbeat] request error: %v", err)
			return
		}
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("[heartbeat] send error: %v", err)
			return
		}
		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			log.Printf("[heartbeat] read body: %v", readErr)
			if resp.StatusCode != 200 {
				log.Printf("[heartbeat] unexpected status %d", resp.StatusCode)
			}
			return
		}

		if resp.StatusCode != 200 {
			log.Printf("[heartbeat] unexpected status %d", resp.StatusCode)
			return
		}

		var top map[string]json.RawMessage
		if json.Unmarshal(body, &top) != nil {
			return
		}
		rawAC, ok := top["agent_config"]
		if !ok {
			return
		}
		var ac struct {
			MinSeverity *string `json:"min_severity"`
		}
		if json.Unmarshal(rawAC, &ac) != nil {
			return
		}
		prev := gate.Effective()
		gate.SetFromDashboard(ac.MinSeverity)
		if cur := gate.Effective(); cur != prev {
			log.Printf("[heartbeat] min_severity effective=%q (PushLog dashboard override applied)", cur)
		}
	}

	// Send immediately on start
	send()

	ticker := time.NewTicker(Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			send()
		}
	}
}
