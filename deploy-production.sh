#!/bin/bash

# PushLog Production Promotion Script
# Trigger manually (or via staging admin endpoint) after staging approval.

set -e

# Ignore hangup so this script survives its parent being killed.
trap '' HUP

APP_DIR="${APP_DIR:-/var/www/pushlog}"
LOG_FILE="${APP_DIR}/deploy-production.log"
LOCK_FILE="${PROMOTE_LOCK_FILE:-${APP_DIR}/.promote-production.lock}"

# Always clean up lock on exit (success or failure).
cleanup() {
  rm -f "$LOCK_FILE" 2>/dev/null || true
}
trap cleanup EXIT

log() {
  echo "[$(TZ='America/Los_Angeles' date '+%Y-%m-%d %I:%M:%S %p %Z')] $1" | tee -a "$LOG_FILE"
}

if [ ! -d "$APP_DIR" ]; then
  log "ERROR: App directory not found: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"
log "Starting production promotion..."
log "Triggered by: ${PROMOTED_BY:-unknown}"

# ── Stage: Check packages ──
log "Checking package.json for dependency changes..."
PKG_COMPARE_BIN=""
if [ -f target/release/pkg-compare ]; then
  PKG_COMPARE_BIN="target/release/pkg-compare"
elif command -v pkg-compare >/dev/null 2>&1; then
  PKG_COMPARE_BIN="pkg-compare"
fi

NEED_INSTALL=false
if [ ! -d node_modules ]; then
  log "  → node_modules missing, will install."
  NEED_INSTALL=true
elif [ ! -f .deps_installed_pkg.json ]; then
  log "  → No baseline package.json, will install."
  NEED_INSTALL=true
elif [ -n "$PKG_COMPARE_BIN" ]; then
  if $PKG_COMPARE_BIN package.json .deps_installed_pkg.json -q 2>/dev/null; then
    log "  → Packages unchanged, skipping npm install."
  else
    log "  → Packages changed, will install."
    NEED_INSTALL=true
  fi
else
  # Fallback: use lockfile mtime (pkg-compare not built yet)
  if [ ! -f .deps_installed_for ] || [ package-lock.json -nt .deps_installed_for ]; then
    log "  → Lockfile changed (pkg-compare not available), will install."
    NEED_INSTALL=true
  else
    log "  → Lockfile unchanged, skipping npm install."
  fi
fi

if [ "$NEED_INSTALL" = true ]; then
  log "Installing dependencies..."
  npm install --include=dev
  cp package.json .deps_installed_pkg.json 2>/dev/null || true
  cp package-lock.json .deps_installed_for 2>/dev/null || true
fi

# ── Stage: Build Rust ──
log "Building incident-engine (Rust)..."
cargo build --release -p incident-engine 2>/dev/null || log "Warning: incident-engine build skipped (cargo/rust not available)"
cargo build --release -p pkg-compare 2>/dev/null || log "Warning: pkg-compare build skipped (cargo/rust not available)"

log "Building production bundle..."
npm run build:production

log "Restarting production PM2 app..."

# PM2 restart can hang when called from a child of the process being restarted.
# Fire-and-forget: background the restart, sleep to let it take effect, then verify.
nohup /usr/bin/pm2 restart pushlog-prod --update-env </dev/null >/dev/null 2>&1 &
PM2_PID=$!

# Wait up to 15 seconds for PM2 restart to finish
for i in $(seq 1 15); do
  if ! kill -0 "$PM2_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

# Check if app is running
if /usr/bin/pm2 pid pushlog-prod >/dev/null 2>&1; then
  log "PM2 restart succeeded."
else
  log "PM2 restart may have failed. Attempting fresh start..."
  /usr/bin/pm2 delete pushlog-prod >/dev/null 2>&1 || true
  nohup /usr/bin/pm2 start dist/index.js --name pushlog-prod -i 1 --update-env </dev/null >/dev/null 2>&1 &
  sleep 5
fi

# Metadata writes should not fail the whole deployment.
DEPLOYED_SHA="$(git rev-parse HEAD 2>/dev/null || echo "unknown")"
DEPLOYED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo "$DEPLOYED_SHA" > "${APP_DIR}/.prod_deployed_sha" || true
echo "$DEPLOYED_AT" > "${APP_DIR}/.prod_deployed_at" || true

log "Production promotion completed. SHA=${DEPLOYED_SHA}"
