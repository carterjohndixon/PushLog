package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/pushlog/pushlog-agent/internal/config"
	"github.com/pushlog/pushlog-agent/internal/heartbeat"
	"github.com/pushlog/pushlog-agent/internal/parser"
	"github.com/pushlog/pushlog-agent/internal/queue"
	"github.com/pushlog/pushlog-agent/internal/shipper"
	"github.com/pushlog/pushlog-agent/internal/source"
	"github.com/pushlog/pushlog-agent/internal/spool"
)

var version = "dev"

func main() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[pushlog-agent] ")

	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "connect":
		cmdConnect()
	case "run":
		cmdRun()
	case "test":
		cmdTest()
	case "version":
		fmt.Printf("pushlog-agent %s\n", version)
	case "paths":
		cmdPaths()
	case "parse":
		cmdParse()
	case "help", "--help", "-h":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`pushlog-agent — PushLog server log collector

Usage:
  pushlog-agent connect --token <plg_xxx> [--endpoint <url>] [--config <path>]
  pushlog-agent run [--config <path>]
  pushlog-agent test [--config <path>]
  pushlog-agent paths [--config <path>]
  pushlog-agent parse [--config <path>] [--file <path>]
  pushlog-agent version

Commands:
  connect   Save token and endpoint to config file
  run       Start watching sources and shipping events
  test      Send a test event and heartbeat to verify connectivity
  paths     Show paths to config, spool, and other agent files
  parse     Parse log lines (stdin or file) and show what would be shipped or filtered
  version   Print version`)
}

func cmdConnect() {
	var token, endpoint, cfgPath string
	endpoint = "https://pushlog.ai"
	cfgPath = config.DefaultConfigPath

	args := os.Args[2:]
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--token":
			if i+1 < len(args) {
				token = args[i+1]
				i++
			}
		case "--endpoint":
			if i+1 < len(args) {
				endpoint = args[i+1]
				i++
			}
		case "--config":
			if i+1 < len(args) {
				cfgPath = args[i+1]
				i++
			}
		}
	}

	if token == "" || !strings.HasPrefix(token, "plg_") {
		fmt.Fprintln(os.Stderr, "Error: --token is required and must start with plg_")
		os.Exit(1)
	}

	endpoint = strings.TrimRight(endpoint, "/")

	if err := config.WriteToken(cfgPath, endpoint, token); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Config written to %s\n", cfgPath)
	fmt.Println("Edit the file to add sources, then run:")
	fmt.Println("  sudo systemctl enable --now pushlog-agent")
}

func cmdRun() {
	cfgPath := config.DefaultConfigPath
	for i := 2; i < len(os.Args); i++ {
		if os.Args[i] == "--config" && i+1 < len(os.Args) {
			cfgPath = os.Args[i+1]
		}
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if len(cfg.Sources) == 0 {
		log.Fatal("No sources configured. Edit config and add at least one source.")
	}

	log.Printf("Starting pushlog-agent %s (endpoint=%s, env=%s, sources=%d)",
		version, cfg.Endpoint, cfg.Environment, len(cfg.Sources))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Graceful shutdown on SIGINT/SIGTERM
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		log.Printf("Received %s, shutting down...", sig)
		cancel()
	}()

	// Initialize queue, spool, shipper
	q := queue.New(queue.DefaultMaxSize)
	sp, err := spool.New(cfg.SpoolDir)
	if err != nil {
		log.Fatalf("Failed to init spool: %v", err)
	}

	sh := shipper.New(cfg.Endpoint, cfg.Token, q, sp)
	eventCh := make(chan *parser.InboundEvent, 1000)

	// Fan-in: move events from channel to queue
	go func() {
		for ev := range eventCh {
			q.Push(ev)
		}
	}()

	// Start sources
	for _, src := range cfg.Sources {
		switch src.Type {
		case "file":
			log.Printf("Starting file source: %s", src.Path)
			go source.TailFile(ctx, src.Path, cfg.Service, cfg.Environment, eventCh)
		case "journald":
			log.Printf("Starting journald source: unit=%s", src.Unit)
			go source.TailJournald(ctx, src.Unit, cfg.Service, cfg.Environment, eventCh)
		case "docker":
			log.Printf("Starting docker source: container=%s", src.Container)
			go source.TailDocker(ctx, src.Container, cfg.Service, cfg.Environment, eventCh)
		default:
			log.Printf("Unknown source type %q, skipping", src.Type)
		}
	}

	// Start heartbeat
	go heartbeat.Run(ctx, cfg)

	// Start shipper (blocks until ctx cancelled)
	sh.Run(ctx)

	log.Println("Shutdown complete")
}

func cmdTest() {
	cfgPath := config.DefaultConfigPath
	for i := 2; i < len(os.Args); i++ {
		if os.Args[i] == "--config" && i+1 < len(os.Args) {
			cfgPath = os.Args[i+1]
		}
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}

	// Test event
	ev := parser.InboundEvent{
		Source:        "agent",
		Service:       cfg.Service,
		Environment:   cfg.Environment,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		Severity:      "warning",
		ExceptionType: "TestEvent",
		Message:       "pushlog-agent connectivity test",
		Stacktrace:    []parser.StackFrame{{File: "test"}},
	}

	body, _ := json.Marshal(ev)
	req, _ := http.NewRequest(http.MethodPost, cfg.Endpoint+"/api/ingest/events", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", "application/json")

	fmt.Print("Sending test event... ")
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("FAILED: %v\n", err)
		os.Exit(1)
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode == 202 {
		fmt.Println("OK (202 Accepted)")
	} else {
		fmt.Printf("FAILED: HTTP %d — %s\n", resp.StatusCode, string(respBody))
		os.Exit(1)
	}

	// Test heartbeat
	hb := map[string]interface{}{
		"hostname":    config.Hostname(),
		"arch":        config.Arch(),
		"environment": cfg.Environment,
		"sources":     []string{"test"},
	}
	hbBody, _ := json.Marshal(hb)
	hbReq, _ := http.NewRequest(http.MethodPost, cfg.Endpoint+"/api/ingest/heartbeat", bytes.NewReader(hbBody))
	hbReq.Header.Set("Authorization", "Bearer "+cfg.Token)
	hbReq.Header.Set("Content-Type", "application/json")

	fmt.Print("Sending heartbeat...  ")
	hbResp, err := client.Do(hbReq)
	if err != nil {
		fmt.Printf("FAILED: %v\n", err)
		os.Exit(1)
	}
	hbRespBody, _ := io.ReadAll(hbResp.Body)
	hbResp.Body.Close()

	if hbResp.StatusCode == 200 {
		fmt.Println("OK (200)")
	} else {
		fmt.Printf("FAILED: HTTP %d — %s\n", hbResp.StatusCode, string(hbRespBody))
		os.Exit(1)
	}

	fmt.Println("\nAgent connectivity verified. Ready to run.")
}

func cmdPaths() {
	cfgPath := config.DefaultConfigPath
	for i := 2; i < len(os.Args); i++ {
		if os.Args[i] == "--config" && i+1 < len(os.Args) {
			cfgPath = os.Args[i+1]
			break
		}
	}

	cfgDir := filepath.Dir(cfgPath)
	if cfgDir == "." {
		cfgDir, _ = filepath.Abs(cfgDir)
	}

	spoolDir := config.DefaultSpoolDir
	if cfg, err := config.Load(cfgPath); err == nil && cfg.SpoolDir != "" {
		spoolDir = cfg.SpoolDir
	}

	fmt.Println("pushlog-agent — file paths")
	fmt.Println()
	fmt.Printf("  %-40s %s\n", "Config file", cfgPath)
	fmt.Println("    Main config: endpoint, token, service, environment, sources (file/journald/docker)")
	fmt.Println()
	fmt.Printf("  %-40s %s\n", "Config directory", cfgDir)
	fmt.Println("    Where config.yaml lives; systemd grants read-only access here")
	fmt.Println()
	fmt.Printf("  %-40s %s\n", "Spool directory", spoolDir)
	fmt.Println("    Failed events are written here when the server is unreachable; retried on next run")
	fmt.Println()
	fmt.Printf("  %-40s %s\n", "Systemd unit (if installed)", "/etc/systemd/system/pushlog-agent.service")
	fmt.Println("    Service file; use systemctl status/restart pushlog-agent")
	fmt.Println()
	fmt.Printf("  %-40s %s\n", "Journal logs", "journalctl -u pushlog-agent -f")
	fmt.Println("    Agent stdout/stderr when run as a systemd service")
	fmt.Println()
	fmt.Println("Override config path:  pushlog-agent paths --config /path/to/config.yaml")
}

func cmdParse() {
	cfgPath := config.DefaultConfigPath
	filePath := ""
	for i := 2; i < len(os.Args); i++ {
		switch os.Args[i] {
		case "--config":
			if i+1 < len(os.Args) {
				cfgPath = os.Args[i+1]
				i++
			}
		case "--file":
			if i+1 < len(os.Args) {
				filePath = os.Args[i+1]
				i++
			}
		case "--help", "-h":
			fmt.Println(`parse — Preview how the agent would interpret your logs (no data is sent)

  Run this to verify your log format is understood and that noise (401s, auth errors)
  is filtered correctly before you rely on the live agent.

Options:
  --file <path>    Parse lines from this file (default: read from stdin)
  --config <path>  Use service/env from config (default: app, production)

Output legend:
  FILTERED (noise)   Line matches 401/403/auth patterns — never shipped
  SKIP (no severity) Line has no error/warn/critical — ignored
  SHIP               Line would be sent to PushLog (shows full event JSON)

Examples:
  echo "Error: 401 Not authenticated" | pushlog-agent parse
  pushlog-agent parse --file /var/log/myapp.log
  tail -f /var/log/app.log | pushlog-agent parse`)
			return
		}
	}

	service, env := "app", "production"
	if cfg, err := config.Load(cfgPath); err == nil {
		service = cfg.Service
		env = cfg.Environment
	}

	var input io.Reader
	if filePath != "" {
		f, err := os.Open(filePath)
		if err != nil {
			log.Fatalf("Open %s: %v", filePath, err)
		}
		defer f.Close()
		input = f
	} else {
		input = os.Stdin
	}

	fmt.Printf("Parsing as service=%q environment=%q\n", service, env)
	fmt.Println("Legend: FILTERED = noise (401/403/auth), SKIP = no severity, SHIP = would be sent to server")
	fmt.Println()

	scanner := bufio.NewScanner(input)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		ev := parser.ParseLine(line, service, env)
		if ev == nil {
			// Could be filtered (noise) or no severity
			if parser.MatchesIgnorePattern(line) {
				fmt.Printf("%d: FILTERED (noise)  %s\n", lineNum, truncate(line, 80))
			} else {
				fmt.Printf("%d: SKIP (no severity) %s\n", lineNum, truncate(line, 80))
			}
		} else {
			summary := fmt.Sprintf("severity=%s exception=%s", ev.Severity, ev.ExceptionType)
			fmt.Printf("%d: SHIP %s\n", lineNum, summary)
			j, _ := json.MarshalIndent(ev, "    ", "  ")
			fmt.Printf("    %s\n", strings.ReplaceAll(string(j), "\n", "\n    "))
		}
	}
	if err := scanner.Err(); err != nil {
		log.Fatalf("Read error: %v", err)
	}
}

func truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
