# Risk Engine

PushLog's **diff / risk scoring engine** (Part 2.1). Turns each push's file list, commit message, and churn into a numeric impact score, risk flags, change-type tags, hotspot files, and short explanations. Used in the GitHub webhook before persisting the push event.

**V1:** Rule-based only — no AI, no database, no network. Pure computation.

---

## How it's used

- **Invocation:** The Node app spawns this binary as a **subprocess** for each push.
- **Input:** One JSON object on **stdin** (commit message, files changed, additions, deletions).
- **Output:** One JSON object on **stdout** (impact score, risk flags, change-type tags, hotspot files, explanations).
- **On error or timeout:** Node logs and continues; the push event is still created with null risk fields.

---

## Input (JSON from Node)

| Field            | Type     | Description                          |
|------------------|----------|--------------------------------------|
| `commit_message` | string   | Commit or PR title message           |
| `files_changed`  | string[] | Paths of added/modified/removed files|
| `additions`      | number   | Lines added                          |
| `deletions`      | number   | Lines deleted                        |
| `diff_text`      | string?  | Optional; reserved for future use   |

---

## Output (JSON to Node)

| Field               | Type     | Description                                      |
|---------------------|----------|--------------------------------------------------|
| `impact_score`       | number   | 0–100; higher = more impactful / risk-sensitive  |
| `risk_flags`        | string[] | e.g. `["auth", "deps", "migration", "secrets"]`  |
| `change_type_tags`  | string[] | e.g. `["feature", "tests", "docs"]`              |
| `hotspot_files`     | string[] | Top changed files (up to 10)                     |
| `explanations`      | string[] | Short human-readable reasons                     |

---

## Risk flags (path-based)

- **deps** — Lockfiles, `go.mod` / `go.sum`
- **migration** — Migrations, schema, Prisma
- **auth** — Auth, JWT, OAuth, session, ACL, permission
- **config** — `.env`, config, secrets, keys, credential
- **secrets** — Secret, password, api_key
- **payment** — Payment, Stripe, billing, invoice

---

## Build & run

From the **repo root** (where the workspace `Cargo.toml` lives):

```bash
# Build release binary (used by Node in production)
cargo build -p risk-engine --release

# Run tests
cargo test -p risk-engine

# Manual test: pipe JSON in, get JSON out
echo '{"commit_message":"feat: add auth","files_changed":["src/auth/jwt.go","package-lock.json"],"additions":50,"deletions":10}' | cargo run -p risk-engine --release
```

Binary path used by Node: `target/release/risk-engine` (or `target/debug/risk-engine` if release isn't built). Override with `RISK_ENGINE_BIN`.

---

## Crate layout

| Path        | Role                                                |
|------------|------------------------------------------------------|
| `src/main.rs`   | Binary: read stdin → parse JSON → `run()` → write stdout |
| `src/lib.rs`    | Orchestration: calls risk, change_type, score modules   |
| `src/types.rs`  | Input / Output structs (serde)                         |
| `src/risk.rs`   | Risk flags from file paths                             |
| `src/change_type.rs` | Change-type tags from message + paths              |
| `src/score.rs`  | Impact score, hotspot files, explanations               |
