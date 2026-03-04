package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"gopkg.in/yaml.v3"
)

const (
	DefaultConfigPath = "/etc/pushlog-agent/config.yaml"
	DefaultSpoolDir   = "/var/lib/pushlog-agent/spool"
)

type SourceConfig struct {
	Type  string `yaml:"type"`            // "file" or "journald"
	Path  string `yaml:"path,omitempty"`  // file path (glob ok for future)
	Unit  string `yaml:"unit,omitempty"`  // systemd unit for journald
}

type Config struct {
	Endpoint    string         `yaml:"endpoint"`
	Token       string         `yaml:"token"`
	Environment string         `yaml:"environment"`
	Service     string         `yaml:"service"`
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
