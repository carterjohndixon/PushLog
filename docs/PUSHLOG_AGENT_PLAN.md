# PushLog Agent — Feature Plan

## Overview

PushLog Agent is a lightweight program that runs on a customer's Linux server (e.g. EC2) and streams runtime errors and log events to PushLog. This enables the incident engine to detect incidents from server logs — even without Sentry.

The agent does NOT run the incident engine, talk to Slack/GitHub, or interact with any PushLog internals. It is a simple collector that POSTs events over HTTPS.

---

## Architecture

```
Customer Server                PushLog Backend
+-------------------+         +----------------------------------+
|                   |         |                                  |
| journald / files  |         |  POST /api/ingest/events         |
| docker logs       |         |    ↓                             |
|       ↓           |  HTTPS  |  agentAuth middleware            |
|  pushlog-agent ──────────►  |  agentRateLimit (1000 evt/min)   |
|       ↓           |         |  agentBuffer (batch 50/200ms)    |
|  heartbeat ───────────────► |    ↓                             |
|  (every 30s)      |         |  ingestIncidentEvent(event)      |
+-------------------+         |    ↓                             |
                              |  Rust incident engine (stdin)    |
                              |    ↓                             |
                              |  IncidentSummary (stdout)        |
                              |    ↓                             |
                              |  handleIncidentSummary           |
                              |    → create notification         |
                              |    → send email                  |
                              |    → broadcast to dashboard      |
                              +----------------------------------+
```

---

## Data Flow

1. Agent watches log sources (journald, file, docker)
2. Detects error-like events, extracts structured fields
3. Converts to `InboundEvent` JSON matching `IncidentEventInput`
4. POSTs to `POST /api/ingest/events` with `Authorization: Bearer plg_xxx`
5. PushLog resolves agent → organization via token hash lookup
6. Event is buffered, then fed to `ingestIncidentEvent(event)`
7. Rust incident engine processes the event (fingerprinting, spike detection, etc.)
8. On incident detection, engine emits `IncidentSummary` via stdout
9. Node backend resolves notification targets via org + service name
10. Notifications sent (in-app, email, Slack)

---

## Security Model

### Token Lifecycle

- Tokens are generated as `plg_<24 random bytes base64url>`
- Only the SHA-256 HMAC hash is stored in `organization_agents.token_hash`
- Raw token is shown once at creation and never persisted server-side
- Tokens can be revoked (sets `status = 'revoked'`)
- Revoked tokens are immediately rejected by auth middleware

### Authentication

- Agent requests use `Authorization: Bearer plg_xxx` (no cookies/sessions)
- The `authenticateAgentToken` middleware hashes the token and looks up the agent
- On success: `req.agentId` and `req.agentOrgId` are attached
- `last_seen_at` is updated with 30s debounce to reduce DB writes

### Rate Limiting

- Per-token sliding window: 1000 events per 60 seconds
- Exceeding returns HTTP 429 with `Retry-After` header
- Heartbeat endpoint is not rate-limited

### Buffering

- Server-side write buffer batches events before feeding to the engine
- Flushes every 200ms or at 50 events, whichever comes first
- Prevents overwhelming the Rust subprocess stdin pipe during bursts

### Management

- Only org owners and admins can create/list/revoke agents
- Agent management endpoints use session auth + org role checks

---

## Database Schema

### `organization_agents` table

| Column             | Type        | Notes                              |
|--------------------|-------------|------------------------------------|
| id                 | uuid PK     | Default random                     |
| organization_id    | uuid FK     | Links to organizations             |
| name               | text        | Human-readable name                |
| token_hash         | text UNIQUE | HMAC-SHA256 of raw token           |
| created_by_user_id | uuid FK     | Who created the agent              |
| last_seen_at       | timestamptz | Updated on heartbeat / auth        |
| hostname           | text        | Reported by agent                  |
| arch               | text        | e.g. amd64, arm64                  |
| environment        | text        | e.g. production, staging           |
| sources            | jsonb       | e.g. ["journald", "/var/log/app"]  |
| status             | text        | "active" or "revoked"              |
| created_at         | timestamptz | Default now                        |

---

## Endpoint Contracts

### POST /api/ingest/events

**Auth:** `Authorization: Bearer plg_xxx`

**Request body:**
```json
{
  "source": "agent",
  "service": "my-api",
  "environment": "production",
  "timestamp": "2026-03-04T12:00:00Z",
  "severity": "error",
  "exception_type": "TypeError",
  "message": "Cannot read property 'id' of undefined",
  "stacktrace": [
    { "file": "src/handlers/user.ts", "function": "getUser", "line": 42 }
  ],
  "tags": { "version": "1.2.3" }
}
```

**Response:** `202 Accepted`
```json
{ "accepted": true }
```

**Errors:**
- `400` — invalid payload (Zod validation)
- `401` — missing/invalid/revoked token
- `429` — rate limit exceeded (includes `Retry-After` header)

### POST /api/ingest/heartbeat

**Auth:** `Authorization: Bearer plg_xxx`

**Request body:**
```json
{
  "hostname": "ip-10-0-1-42",
  "arch": "amd64",
  "environment": "production",
  "sources": ["journald", "/var/log/myapp.log"]
}
```

**Response:** `200 OK`
```json
{ "ok": true }
```

### POST /api/agents

**Auth:** Session (owner/admin only)

**Request body:**
```json
{ "name": "production-api-1" }
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "name": "production-api-1",
  "token": "plg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### GET /api/agents

**Auth:** Session (owner/admin only)

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "production-api-1",
    "hostname": "ip-10-0-1-42",
    "arch": "amd64",
    "environment": "production",
    "sources": ["journald"],
    "status": "active",
    "connected": true,
    "lastSeenAt": "2026-03-04T12:00:00Z",
    "createdAt": "2026-03-01T10:00:00Z"
  }
]
```

`connected` is true when `status = "active"` and `lastSeenAt` is within 5 minutes.

### DELETE /api/agents/:id

**Auth:** Session (owner/admin only)

**Response:** `200 OK`
```json
{ "ok": true }
```

---

## Install Process (Phase 2 — Agent Program)

> Phase 2 is not yet implemented. This describes the target experience.

### Quick install

```bash
curl -fsSL https://pushlog.ai/install.sh | sh
```

The installer:
1. Detects Linux architecture (amd64 / arm64)
2. Downloads the prebuilt binary
3. Installs to `/usr/local/bin/pushlog-agent`
4. Creates config directory `/etc/pushlog-agent/`
5. Installs a systemd service unit

### Connect

```bash
sudo pushlog-agent connect --token plg_xxx
```

This writes the token to `/etc/pushlog-agent/config.yaml`.

### Start

```bash
sudo systemctl enable --now pushlog-agent
```

### Config file

```yaml
# /etc/pushlog-agent/config.yaml
endpoint: https://app.pushlog.ai
token: plg_xxx
sources:
  - type: journald
    units: ["myapp.service"]
  - type: file
    path: /var/log/myapp/*.log
  - type: docker
    containers: ["api", "worker"]
environment: production
```

### Agent behavior

- Watches configured log sources
- Detects error-like events using pattern matching
- Extracts: timestamp, severity, exception_type, message, stacktrace
- Converts to InboundEvent JSON
- POSTs to `/api/ingest/events`
- Sends heartbeat every 30 seconds to `/api/ingest/heartbeat`
- Local buffering with exponential retry if PushLog is unreachable
- Low CPU, minimal memory footprint
- Written in Go or Rust (single static binary, no runtime deps)

---

## UI

### Settings > Agents

Available to org owners and admins on the Settings page:

- **Create Agent** button opens a dialog for naming the agent
- After creation, the raw token is displayed once with a copy button
- Agent list shows: name, hostname, environment, status badge, last seen
- Status: "Connected" (green, heartbeat within 5 min) or "Offline" (gray)
- Revoke button with confirmation dialog

---

## Future Improvements

- **Agent dashboard page** (`/agents`) with per-agent event volume charts
- **Agent health alerts** — notify when an agent goes offline
- **Event sampling** — allow agents to sample high-volume log sources
- **Agent auto-update** — self-update mechanism via GitHub releases
- **Multi-org agent** — single agent binary supporting multiple tokens
- **Windows / macOS support** — extend beyond Linux
- **Agent SDK** — language-specific libraries (Node, Python, Go) for programmatic event submission
- **Webhook fallback** — accept events from generic HTTP clients without the agent binary
