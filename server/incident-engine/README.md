# Incident Engine

The **Incident Engine** is a small Rust program that ingests error and alert events, groups them by a stable fingerprint, detects when to trigger an incident (spike, new issue, regression, or deploy), optionally correlates incidents to recent commits, and emits structured incident summaries. It is used by PushLog to turn raw Sentry (and other) webhook events into actionable incident notifications.

**Design:** No database, no network, no AI. It runs as a long-lived subprocess. The Node server writes one JSON event per line to the engine's stdin and reads one JSON incident summary per line from stdout. All state is in-memory (per-fingerprint counts and baselines), so it's fast and easy to reason about.

---

## What it does

1. **Ingests events**  
   Each line on stdin is a JSON `InboundEvent`: source, service, environment, timestamp, severity, exception type, message, stack trace (file/function/line), optional change window (recent deploy + commits), and optional correlation hints.

2. **Groups by fingerprint**  
   Events are grouped by a stable fingerprint: `exception_type` + `service` + `environment` + top N stack frames (file + function, no line numbers). The fingerprint is a BLAKE3 hash so the same logical "issue" always maps to the same group.

3. **Maintains streaming stats**  
   For each fingerprint, the engine keeps per-minute counts, first/last seen, and an EWMA baseline. It uses this to detect:
   - **Spike** — current minute's count is above a threshold multiple of the baseline (e.g. 3×).
   - **Regression** — the issue was quiet for a configured number of minutes, then recurred.
   - **New issue** — first time we've ever seen this fingerprint (only triggers in `prod`).
   - **Deploy** — every GitPush (deploy) event triggers an incident report.

4. **Correlates to deploys (optional)**  
   If the event includes a `change_window` (deploy time + list of commits with timestamps and changed files), the engine ranks commits by relevance to the stack trace (file overlap, time proximity, optional critical-path boost and docs/tests downweight). It returns a list of suspected causes with scores and evidence.

5. **Emits incident summaries**  
   When a trigger fires, the engine writes one JSON `IncidentSummary` line to stdout: incident ID, title, service, environment, severity, priority score, trigger reason, time range, top symptoms, suspected causes, recommended first actions, stack trace, and links. The Node server subscribes to these lines and creates notifications (in-app and email).

---

## How PushLog uses it

- **Sentry webhook** → Node parses the event, resolves server-side stack frames with `dist/index.js.map` (client frames are already symbolicated by Sentry), builds an `InboundEvent` with optional `change_window` from GitHub deploy data, and calls `ingestIncidentEvent(event)`.
- **GitHub push webhook** → Node builds a deploy-style event (e.g. `exception_type: "GitPush"`) with a change window and ingests it; the engine always emits a deploy incident.
- **Node** keeps the engine process alive (`server/incidentEngine.ts`), sends events over stdin, and listens for summary lines on stdout to create incidents and send emails.

The engine does **not** fetch data from the network, resolve source maps, or talk to Sentry/GitHub. It only computes on the events it is given.

---

## Input (stdin)

One JSON object per line, UTF-8. Each line is an **InboundEvent** (see `src/types.rs`). Required fields:

- `source`, `service`, `environment`, `timestamp` (ISO 8601), `severity`, `exception_type`, `message`
- `stacktrace`: array of `{ file, function?, line? }`

Optional: `tags`, `links`, `change_window` (deploy time + commits with id, timestamp, files, optional risk_score), `correlation_hints` (critical_paths, low_priority_paths), `api_route`, `request_url`.

---

## Output (stdout)

- **When an incident is triggered:** one JSON line per incident, an **IncidentSummary** (incident_id, title, service, environment, severity, priority_score, trigger, start_time, last_seen, peak_time, top_symptoms, suspected_causes, recommended_first_actions, stacktrace, links, api_route, request_url).
- **When input is invalid:** one JSON line per error, an **ErrorOutput** (`error: true`, `message`, optional `field`). The engine does not exit; it continues reading.

Lines that are valid but do not trigger any incident produce no output.

---

## Configuration

Config is in `src/config.rs`. Defaults can be overridden via environment:

| Variable | Meaning | Default |
|----------|---------|--------|
| `INCIDENT_CORRELATION_FILE_WEIGHT` | Weight for file-overlap in commit scoring (0–1) | 0.7 |
| `INCIDENT_CORRELATION_TIME_WEIGHT` | Weight for time proximity (0–1) | 0.3 |
| `INCIDENT_CORRELATION_RISK_WEIGHT` | Weight for commit risk score (0–1) | 0.0 |

Other parameters (spike threshold, EWMA alpha, regression quiet minutes, fingerprint max frames, correlation max hours) are fixed in code but could be moved to config or env later.

---

## Build and run

From the repo root:

```bash
cargo build -p incident-engine --release
```

The binary is `target/release/incident-engine`. The Node server looks for it at `server/target/release/incident-engine` (or `INCIDENT_ENGINE_BIN` if set).

**Standalone (for testing):**

```bash
cargo run -p incident-engine --release
# Then type or paste JSON lines; each incident summary is printed to stdout.
```

Or pipe a file:

```bash
cat events.jsonl | ./target/release/incident-engine
```

---

## Tests

```bash
cargo test -p incident-engine
```

Tests cover fingerprint stability, new-issue and spike and regression triggers, deploy trigger, correlation with change_window, and validation errors.

---

## Layout

- `src/main.rs` — binary: read stdin, write stdout, one engine instance.
- `src/lib.rs` — library root; exports `Engine`, `Config`, `InboundEvent`, `IncidentSummary`, etc.
- `src/engine.rs` — core loop: normalize → fingerprint → upsert group → update stats → trigger? → assemble summary.
- `src/types.rs` — inbound/outbound JSON types and internal normalized types.
- `src/config.rs` — config and env parsing.
- `src/normalize.rs` — validate and normalize inbound events (timestamps, severity, frames).
- `src/fingerprint.rs` — stable BLAKE3 fingerprint from exception_type + service + env + top frames.
- `src/stats.rs` — per-minute buckets, EWMA baseline, spike and regression detection.
- `src/correlation.rs` — rank commits in a change window by relevance to stack frames.
- `src/error.rs` — engine error and validation errors.

The Node integration (spawn, stdin/stdout, queueing, restart) lives in `server/incidentEngine.ts`, not in this crate.
