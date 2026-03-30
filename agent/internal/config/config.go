package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	DefaultConfigPath = "/etc/pushlog-agent/config.yaml"
	DefaultSpoolDir   = "/var/lib/pushlog-agent/spool"
)

type SourceConfig struct {
	Type      string `yaml:"type"`               // "file", "journald", or "docker"
	Path      string `yaml:"path,omitempty"`     // file path for file source
	Unit      string `yaml:"unit,omitempty"`     // systemd unit for journald
	Container string `yaml:"container,omitempty"` // container name or ID for docker source
}

type Config struct {
	Endpoint    string         `yaml:"endpoint"`
	Token       string         `yaml:"token"`
	Environment string         `yaml:"environment"`
	Service     string         `yaml:"service"`
	// NoisePreset: "generic" (default) for customer app logs; "pushlog_api" when tailing PushLog's own API/worker containers.
	NoisePreset string `yaml:"noise_preset,omitempty"`
	// MinSeverity: only ship events at least this severe: warning | error | critical.
	// "critical" = fatal/panic/critical keyword lines only (see parser). Default: warning (ship all parsed severities).
	MinSeverity string `yaml:"min_severity,omitempty"`
	Sources     []SourceConfig `yaml:"sources"`
	SpoolDir    string         `yaml:"spool_dir,omitempty"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	if cfg.Endpoint == "" {
		return nil, fmt.Errorf("config: endpoint is required")
	}
	if cfg.Token == "" {
		return nil, fmt.Errorf("config: token is required")
	}
	if cfg.Environment == "" {
		cfg.Environment = "production"
	}
	if cfg.Service == "" {
		cfg.Service = "app"
	}
	if cfg.SpoolDir == "" {
		cfg.SpoolDir = DefaultSpoolDir
	}
	switch strings.TrimSpace(strings.ToLower(cfg.NoisePreset)) {
	case "", "generic":
		cfg.NoisePreset = "generic"
	case "pushlog_api":
		cfg.NoisePreset = "pushlog_api"
	default:
		return nil, fmt.Errorf("config: noise_preset must be generic or pushlog_api, got %q", cfg.NoisePreset)
	}
	ms := strings.TrimSpace(strings.ToLower(cfg.MinSeverity))
	if ms == "" {
		ms = "warning"
	}
	switch ms {
	case "warning", "error", "critical":
		cfg.MinSeverity = ms
	default:
		return nil, fmt.Errorf("config: min_severity must be warning, error, or critical, got %q", cfg.MinSeverity)
	}
	return &cfg, nil
}

func WriteToken(path, endpoint, token string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	cfg := Config{
		Endpoint:    endpoint,
		Token:       token,
		Environment: "production",
		Service:     "app",
		Sources:     []SourceConfig{},
	}
	data, err := yaml.Marshal(&cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	if err := os.WriteFile(path, data, 0640); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	return nil
}

func Hostname() string {
	h, _ := os.Hostname()
	return h
}

func Arch() string {
	return runtime.GOARCH
}
