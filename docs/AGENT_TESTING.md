# PushLog Agent — Testing Guide

## Prerequisites

1. **Database migration** — Run the `organization_agents` migration if you haven't already:
   ```bash
   psql $DATABASE_URL -f migrations/0005_organization_agents.sql
   ```
   Or use `npm run db:push` if your workflow uses Drizzle schema push.

2. **Running app** — Start the server locally or use your staging URL:
   ```bash
   npm run dev
   ```

3. **User** — Log in as an **owner** or **admin** (developer/viewer cannot create agents).

---

## Test 1: Settings UI — Create Agent

**Steps:**
1. Go to **Settings** (`/settings`)
2. Find the **Agents** section (only visible if you're owner/admin)
3. Click **Create Agent**
4. Enter a name (e.g. `test-agent-1`)
5. Click **Create**

**Expected:**
- Dialog shows the token once: `plg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- Token has a copy button
- Warning text: "Save this token now -- it will not be shown again"
- Closing the dialog and reopening shows the agent in the list (no token shown again)

**Failure modes:**
- No Agents section → You're not owner/admin
- 500 error → Migration likely not run; check `organization_agents` table exists

---

## Test 2: Settings UI — Agent List & Status

**Steps:**
1. After creating an agent, observe the list
2. Leave it for a few minutes

**Expected:**
- Agent appears with **Offline** badge (no heartbeat yet)
- Shows name, "No metadata yet", created date
- **Revoke** button is visible

After sending a heartbeat (Test 4), refresh or wait for refetch:
- Agent shows **Connected** (green) if heartbeat was within 5 minutes
- Shows hostname, environment, arch if provided in heartbeat

---

## Test 3: Settings UI — Revoke Agent

**Steps:**
1. Click **Revoke** on an agent
2. Confirm in the dialog

**Expected:**
- Agent status becomes **Revoked**
- Revoke button is gone
- Token is rejected on later ingest requests (401)

---

## Test 4: POST /api/ingest/events (Valid)

**Setup:** Replace `plg_xxx` with a real token from Test 1.

```bash
curl -X POST http://localhost:5000/api/ingest/events \
  -H "Authorization: Bearer plg_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "agent",
    "service": "my-api",
    "environment": "production",
    "timestamp": "2026-03-04T12:00:00Z",
    "severity": "error",
    "exception_type": "TypeError",
    "message": "Cannot read property id of undefined",
    "stacktrace": [{"file": "src/handlers/user.ts", "function": "handleRequest", "line": 42}]
  }'
```

**Expected:** `202 Accepted`
```json
{ "accepted": true }
```

**Behind the scenes:** Event is buffered, then fed into the Rust incident engine. If the engine detects an incident (spike, new issue, etc.), it will emit a summary and the Node backend will create notifications. That may or may not happen depending on engine thresholds and event volume.

---

## Test 5: POST /api/ingest/heartbeat

```bash
curl -X POST http://localhost:5000/api/ingest/heartbeat \
  -H "Authorization: Bearer plg_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "ip-10-0-1-42",
    "arch": "amd64",
    "environment": "production",
    "sources": ["journald", "/var/log/app.log"]
  }'
```

**Expected:** `200 OK`
```json
{ "ok": true }
```

**UI check:** In Settings > Agents, the agent should show **Connected** and display hostname, arch, environment.

---

## Test 6: Ingest — Invalid Auth

```bash
curl -X POST http://localhost:5000/api/ingest/events \
  -H "Authorization: Bearer plg_invalid" \
  -H "Content-Type: application/json" \
  -d '{"source":"agent","service":"x","environment":"x","timestamp":"2026-03-04T12:00:00Z","severity":"error","exception_type":"Err","message":"x","stacktrace":[{"file":"a"}]}'
```

**Expected:** `401 Unauthorized`
```json
{ "error": "Invalid or revoked agent token" }
```

---

## Test 7: Ingest — Missing Auth

```bash
curl -X POST http://localhost:5000/api/ingest/events \
  -H "Content-Type: application/json" \
  -d '{"source":"agent","service":"x","environment":"x","timestamp":"2026-03-04T12:00:00Z","severity":"error","exception_type":"Err","message":"x","stacktrace":[{"file":"a"}]}'
```

**Expected:** `401 Unauthorized`
```json
{ "error": "Missing or invalid Authorization header" }
```

---

## Test 8: Ingest — Invalid Payload (Validation)

```bash
curl -X POST http://localhost:5000/api/ingest/events \
  -H "Authorization: Bearer plg_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "my-api",
    "environment": "production"
  }'
```

**Expected:** `400 Bad Request` with Zod validation details:
```json
{
  "error": "Invalid event payload",
  "details": [
    { "path": "source", "message": "Required" },
    { "path": "timestamp", "message": "Required" },
    ...
  ]
}
```

---

## Test 9: Rate Limiting (Optional)

**Steps:** Send 1001+ events within 60 seconds using the same token.

**Expected:** After 1000 events, `429 Too Many Requests`:
```json
{
  "error": "Rate limit exceeded",
  "limit": 1000,
  "window": "60s",
  "retryAfter": 45
}
```
`Retry-After` header is set (seconds until window resets).

---

## Test 10: Cloudflare Zero Trust (Staging)

If ingest is behind Cloudflare Access:
1. Add a bypass for `/api/ingest/*` (or `/api/ingest/events` and `/api/ingest/heartbeat`).
2. Run the same curl commands against `https://staging.pushlog.ai` (or your staging URL).
3. Verify you get 202/200 instead of a Cloudflare Access page or 403.

---

## Test 11: Parse Command — Log Interpretation

Use `pushlog-agent parse` to verify how the agent will interpret your logs without shipping anything.

**From stdin:**
```bash
echo 'Error: GET /api/notifications 401 :: {"error":"Not authenticated"}
Error: Cannot read property id of undefined at handler.ts:42
Fatal: database connection refused' | pushlog-agent parse
```

**From a log file:**
```bash
pushlog-agent parse --file /var/log/your-app.log
```

**With config (uses service/env from config):**
```bash
pushlog-agent parse --config /etc/pushlog-agent/config.yaml --file /var/log/app.log
```

**Expected output:**
- `FILTERED (noise)` — 401/403/auth lines; these are never shipped
- `SKIP (no severity)` — lines without error/warn/critical/panic/fatal
- `SHIP` — event that would be sent, with severity, exception_type, and full JSON

Use this to confirm your log format is understood and that noise (e.g. 401s) is filtered correctly.

---

## Summary Checklist

| Test                    | Expected result                        |
|-------------------------|----------------------------------------|
| Create agent in UI      | Token shown once, agent in list        |
| List agents             | Offline → Connected after heartbeat   |
| Revoke agent            | Revoked badge, token rejected          |
| Ingest with valid token | 202 Accepted                           |
| Heartbeat with valid token | 200 OK                             |
| Invalid/revoked token   | 401 Unauthorized                       |
| Missing auth             | 401 Unauthorized                       |
| Malformed payload       | 400 with validation details            |
| Rate limit (1001 events) | 429 with Retry-After                   |
| Parse command           | Shows FILTERED/SKIP/SHIP for each line |
