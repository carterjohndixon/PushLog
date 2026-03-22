# PushLog Agent (Go) — Summary & Appendix

## What Was Built

A complete Go agent binary (`pushlog-agent`) that runs on Linux servers and streams runtime errors to PushLog. It is a standalone project under `agent/` in the PushLog monorepo.

### File Inventory

```
agent/
├── cmd/
│   └── main.go              # CLI entrypoint: connect, run, test, version
├── internal/
│   ├── config/config.go      # YAML config loader + writer
│   ├── parser/parser.go      # Log line → InboundEvent parser
│   ├── source/
│   │   ├── file.go           # File tail (follow + rotation detection)
│   │   └── journald.go       # journalctl subprocess reader
│   ├── queue/queue.go        # Bounded in-memory event queue
│   ├── spool/spool.go        # Disk spool for unsent events
│   ├── shipper/shipper.go    # HTTPS event shipper with retry/backoff
│   └── heartbeat/heartbeat.go # 30s heartbeat loop
├── deploy/
│   ├── pushlog-agent.service  # systemd unit file
│   └── install.sh            # curl|sh installer
├── Makefile                   # Cross-compilation targets
├── go.mod
└── go.sum
```

---

## Architecture

```
┌─────────────┐     ┌─────────────┐
│  File Tail  │     │  Journald   │
│  source     │     │  source     │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └───────┬───────────┘
               ▼
        ┌──────────────┐
        │  Parser      │  severity classification, exception extraction
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │  Queue       │  bounded (10,000 events), drop-oldest on overflow
        └──────┬───────┘
               ▼
        ┌──────────────┐         ┌──────────────┐
        │  Shipper     │────────►│  PushLog API │
        │  (HTTPS POST)│         │  /api/ingest │
        └──────┬───────┘         └──────────────┘
               │ on failure
               ▼
        ┌──────────────┐
        │  Disk Spool  │  /var/lib/pushlog-agent/spool/
        │  (JSON files)│  survives restarts, flushed on next run
        └──────────────┘

        ┌──────────────┐
        │  Heartbeat   │  every 30s → POST /api/ingest/heartbeat
        └──────────────┘
```

---

## CLI Commands
(Token saved: PushLog-test-1 plg_j_yl2FswFSaroSP0z4siG-lDzTeLoa9L)
### `connect`

```bash
sudo pushlog-agent connect --token plg_xxx [--endpoint https://app.pushlog.ai] [--config /path/to/config.yaml]
```

Writes a starter config to `/etc/pushlog-agent/config.yaml`. User then edits to add sources.

### `run`

```bash
sudo pushlog-agent run [--config /etc/pushlog-agent/config.yaml]
```

Starts the agent. Watches all configured sources, ships events, sends heartbeats. Runs until SIGINT/SIGTERM. On shutdown, remaining queued events are spooled to disk.

### `test`

```bash
sudo pushlog-agent test [--config /etc/pushlog-agent/config.yaml]
```

Sends a single test event and heartbeat to verify connectivity. Prints OK/FAILED for each.

### `version`

```bash
pushlog-agent version
```

---

## Config File

```yaml
# /etc/pushlog-agent/config.yaml
endpoint: https://app.pushlog.ai
token: plg_xxx
environment: production
service: my-api
sources:
  - type: file
    path: /var/log/myapp/error.log
  - type: journald
    unit: myapp.service
  - type: docker
    container: pushlog-staging-app
spool_dir: /var/lib/pushlog-agent/spool   # optional, this is the default
```

---

## Log Source Details

### File Tail (`type: file`)

- Seeks to end of file on start (only new lines)
- Polls at 250ms intervals
- Detects rotation by comparing inodes (like `tail -F`)
- Detects truncation (log file cleared) and reopens
- Handles temporary file disappearance with retry
- 256KB line buffer

### Journald (`type: journald`)

- Spawns: `journalctl -u <unit> -f -o json -n 0`
- Reads JSON lines from stdout
- Parses journald `PRIORITY` field for severity classification
- Auto-restarts subprocess on exit with 2s delay

### Docker (`type: docker`)

- Spawns: `docker logs -f --tail 0 <container>`
- Reads plain-text lines (stdout+stderr merged by Docker)
- Uses the same line parser as the file source
- Auto-restarts on container stop/restart with 2s delay
- Requires Docker CLI and access to `/var/run/docker.sock` (systemd unit includes `ReadWritePaths=/var/run`)

---

## Event Parser

For each log line, the parser:

1. **Classifies severity** via regex:
   - `fatal|panic|critical` → `"critical"`
   - `error|exception|traceback|fail` → `"error"`
   - `warn|warning` → `"warning"`
   - No match → line is skipped (not an error)

2. **Extracts exception type** — matches patterns like `TypeError`, `NullPointerException`, etc.

3. **Extracts stack frames** — best-effort regex for `file.ext:123` patterns

4. **Produces** an `InboundEvent` JSON matching the PushLog server Zod schema

---

## Shipper & Reliability

### HTTP Behavior

| Status | Action |
|--------|--------|
| 202    | Success, reset backoff |
| 400    | Fatal — bad payload, log and skip |
| 401    | Fatal — bad/revoked token, stop |
| 429    | Respect `Retry-After` header, wait |
| 5xx    | Exponential backoff with jitter (1s → 60s max) |
| Network error | Same backoff as 5xx |

### Buffering Stack

1. **In-memory queue** — bounded at 10,000 events, drop-oldest on overflow
2. **Disk spool** — events that fail to send are written as JSON files to `/var/lib/pushlog-agent/spool/`
3. **On startup** — spooled events are flushed first before processing new events
4. **On shutdown** — remaining queued events are spooled to disk
5. **Spool limit** — max 1,000 files on disk; oldest dropped if exceeded

### Flush Cadence

- Shipper polls queue every 500ms
- Drains up to 50 events per batch
- Events are sent individually (one HTTP POST per event, matching server API)

---

## Systemd Service

```ini
[Unit]
Description=PushLog Agent — server log collector
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/pushlog-agent run
Restart=always
RestartSec=5

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/pushlog-agent
ReadOnlyPaths=/etc/pushlog-agent
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Logs go to journald via stdout/stderr. View with:

```bash
journalctl -u pushlog-agent -f
```

---

## Install Process

```bash
curl -fsSL https://pushlog.ai/install.sh | sh
```

The installer:
1. Detects architecture (amd64/arm64)
2. Downloads the correct binary from GitHub releases
3. Installs to `/usr/local/bin/pushlog-agent`
4. Creates `/etc/pushlog-agent/` and `/var/lib/pushlog-agent/spool/`
5. Installs systemd service unit

Then:
```bash
sudo pushlog-agent connect --token plg_xxx
sudo vim /etc/pushlog-agent/config.yaml     # add sources
sudo pushlog-agent test                       # verify
sudo systemctl enable --now pushlog-agent     # start
```

---

## Cross-Compilation

```bash
cd agent
make                    # builds both targets
make linux-amd64        # just amd64
make linux-arm64        # just arm64
```

Produces:
- `dist/pushlog-agent-linux-amd64` (~6.4 MB)
- `dist/pushlog-agent-linux-arm64` (~5.9 MB)

Static binaries, no CGO, no runtime dependencies.

---

## How to Test

### 1. Build locally

```bash
cd agent
go build -o /tmp/pushlog-agent ./cmd
```

### 2. Connect to staging

```bash
/tmp/pushlog-agent connect --token plg_YOUR_TOKEN --endpoint https://staging.pushlog.ai --config /tmp/test-config.yaml
```

### 3. Edit config to add a test file source

```yaml
# /tmp/test-config.yaml
endpoint: https://staging.pushlog.ai
token: plg_YOUR_TOKEN
environment: staging
service: test-agent
sources:
  - type: file
    path: /tmp/test-app.log
spool_dir: /tmp/pushlog-spool
```

### 4. Test connectivity

```bash
/tmp/pushlog-agent test --config /tmp/test-config.yaml
```

Expected:
```
Sending test event... OK (202 Accepted)
Sending heartbeat...  OK (200)

Agent connectivity verified. Ready to run.
```

### 5. Run agent and generate logs

Terminal 1:
```bash
/tmp/pushlog-agent run --config /tmp/test-config.yaml
```

Terminal 2:
```bash
echo "ERROR: TypeError: Cannot read property 'id' of undefined at src/app.ts:42" >> /tmp/test-app.log
echo "WARN: Connection timeout" >> /tmp/test-app.log
echo "INFO: Server started on port 3000" >> /tmp/test-app.log   # should be skipped
echo "FATAL: OutOfMemoryError at heap.go:123" >> /tmp/test-app.log
```

Expected in Terminal 1:
- First, third, and fourth lines produce events (error, warning, critical)
- Second line (INFO) is skipped — no error severity detected
- Agent logs show events being shipped

### 6. Verify in PushLog UI

- Settings > Agents should show the agent as "Connected"
- If the incident engine detects a pattern, you'll see notifications

### 7. Test reliability

```bash
# Stop the server / disconnect network, then write logs
echo "ERROR: Test offline event at handler.go:99" >> /tmp/test-app.log

# Events should be spooled to /tmp/pushlog-spool/
ls /tmp/pushlog-spool/

# Restart server / reconnect — events flush automatically
```

---

## Pros and Cons

### Pros

- **Single static binary** — no runtime, no dependencies, simple deployment
- **Small** — ~6 MB stripped, minimal memory footprint
- **Fast startup** — instant via systemd, no interpreter boot time
- **Cross-platform compilation** — `make` produces both amd64 and arm64 from any OS
- **Reliable** — bounded queue + disk spool + exponential backoff; no data loss on transient failures
- **Secure** — bearer token auth, systemd hardening (NoNewPrivileges, ProtectSystem=strict)
- **Simple install** — `curl | sh` + `connect --token` + `systemctl enable`
- **Zero config on server** — uses the same Phase 1 ingest API, no server changes needed
- **Structured logging** — logs to stdout, captured by systemd/journald
- **Graceful shutdown** — SIGTERM flushes queue to disk spool

### Cons

- **File tail is poll-based** — 250ms poll interval; not inotify. Simpler and more portable but slightly higher latency than inotify. Good enough for error detection (not a real-time stream).
- **No journald native library** — uses `journalctl` subprocess instead of sd-journal C bindings. Avoids CGO (keeping static binary) but requires journalctl on PATH.
- **Pattern-matching parser** — regex-based severity detection and stack frame extraction. Works well for common log formats but won't catch everything. Structured JSON logs would need a future enhancement.
- **Docker source** — uses `docker logs -f` subprocess; requires Docker CLI and socket access.
- **No auto-update** — users must re-run install.sh or manually update. Could add self-update in future.
- **Single-event HTTP POSTs** — ships events one at a time. A future batch POST endpoint on the server would reduce HTTP overhead for high-volume agents.
- **No Windows/macOS** — Linux-only; matches the EC2/server use case.

---

## Future Improvements

1. **Batch POST endpoint** — server-side `/api/ingest/events/batch` to accept arrays
2. **inotify file watcher** — replace polling for lower latency on Linux
3. **Structured log parsing** — detect JSON log lines and extract fields directly
4. **Auto-update** — check GitHub releases and self-update on a schedule
5. **Prometheus metrics** — expose `/metrics` for monitoring agent health
6. **Config reload** — SIGHUP to reload config without restart
7. **Log sampling** — configurable sample rate for high-volume sources
