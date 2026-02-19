#!/bin/bash
# Test the incident-engine (Rust) with critical paths.
# Run from repo root. Requires: cargo build --release -p incident-engine
#
# Usage:
#   ./scripts/test-incident-engine.sh
#   echo '{"source":"pushlog",...}' | ./scripts/test-incident-engine.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BIN="${ROOT}/target/release/incident-engine"
if [ ! -x "$BIN" ]; then
  echo "Building incident-engine..."
  cargo build --release -p incident-engine
fi

# Sample GitPush event with critical_paths. One JSON object per line (engine reads line-by-line).
# Commit touches src/auth/* so it gets "touches critical path" boost.
TEST_EVENT='{"source":"pushlog","service":"my-api","environment":"main","timestamp":"2026-02-19T12:00:00Z","severity":"warning","exception_type":"GitPush","message":"feat: add login validation","stacktrace":[{"file":"src/auth/login.ts","function":"changed"},{"file":"src/auth/utils.ts","function":"changed"}],"links":{"pushlog_user_id":"test-user-123"},"change_window":{"deploy_time":"2026-02-19T12:00:00Z","commits":[{"id":"abc123def456","timestamp":"2026-02-19T11:59:00Z","files":["src/auth/login.ts","src/auth/utils.ts"],"risk_score":45}]},"correlation_hints":{"critical_paths":["src/auth","src/payments"],"low_priority_paths":["docs","tests"]}}'

if [ -t 0 ]; then
  # No stdin: emit test event on a single line, then close pipe so engine exits after processing
  printf '%s\n' "$TEST_EVENT" | "$BIN"
else
  # Stdin provided: pipe through
  "$BIN"
fi
