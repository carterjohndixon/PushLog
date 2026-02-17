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

cd "$APP_DIR" || { log "ERROR: Cannot cd to $APP_DIR"; exit 1; }
ACTUAL_PWD="$(pwd)"
log "Starting production promotion..."
log "Working directory: $ACTUAL_PWD (APP_DIR=$APP_DIR)"
log "Triggered by: ${PROMOTED_BY:-unknown}"
log "Target SHA: ${PROMOTED_SHA:-<not specified, will use current HEAD>}"

# ── Stage: Fetch latest and checkout target SHA ──
if [ -d .git ]; then
  log "Fetching from origin..."
  if ! git fetch origin >> "$LOG_FILE" 2>&1; then
    log "Warning: git fetch failed (check deploy-production.log). Continuing with existing refs."
  fi

  if [ -n "${PROMOTED_SHA:-}" ]; then
    # Normalize to full SHA for comparison
    TARGET_FULL="$(git rev-parse "$PROMOTED_SHA" 2>/dev/null || true)"
    if [ -z "$TARGET_FULL" ]; then
      log "ERROR: Commit $PROMOTED_SHA not found locally. Try: git fetch origin main"
      exit 1
    fi
    CURRENT="$(git rev-parse HEAD 2>/dev/null || true)"
    if [ "$CURRENT" != "$TARGET_FULL" ]; then
      log "Checking out target SHA: ${TARGET_FULL:0:10} (from $PROMOTED_SHA)..."
      if ! git checkout "$TARGET_FULL" >> "$LOG_FILE" 2>&1; then
        log "ERROR: Failed to checkout $TARGET_FULL. Aborting."
        exit 1
      fi
      log "Checked out ${TARGET_FULL:0:10}."
    else
      log "Already at target SHA ${TARGET_FULL:0:10}."
    fi
  else
    # No target SHA passed: pull latest main so we don't deploy stale code
    log "No target SHA specified; pulling latest from origin/main..."
    if git checkout main >> "$LOG_FILE" 2>&1 && git pull origin main >> "$LOG_FILE" 2>&1; then
      log "Updated to latest main."
    else
      log "Warning: could not pull main. Building from current HEAD."
    fi
  fi
fi

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

# Write deployed metadata BEFORE PM2 restart so the new Node process sees it immediately
DEPLOYED_SHA="$(git rev-parse HEAD 2>/dev/null || echo "")"
if [ -z "$DEPLOYED_SHA" ] && [ -n "${PROMOTED_SHA:-}" ]; then
  DEPLOYED_SHA="$PROMOTED_SHA"
fi
if [ -n "$DEPLOYED_SHA" ]; then
  log "Deployed SHA will be: ${DEPLOYED_SHA:0:10}"
fi
if [ -z "$DEPLOYED_SHA" ]; then
  DEPLOYED_SHA="unknown"
fi
DEPLOYED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "$DEPLOYED_SHA" > "${APP_DIR}/.prod_deployed_sha" || true
echo "$DEPLOYED_AT" > "${APP_DIR}/.prod_deployed_at" || true

log "Restarting production PM2 app..."

# Find PM2 binary (handles different installation locations: global, nvm, etc.)
PM2_BIN="$(command -v pm2 || echo /usr/bin/pm2)"
if [ ! -x "$PM2_BIN" ] && [ -f "/usr/local/bin/pm2" ]; then
  PM2_BIN="/usr/local/bin/pm2"
fi

if [ ! -x "$PM2_BIN" ]; then
  log "ERROR: pm2 binary not found. Install with: npm install -g pm2"
  exit 1
fi

log "Using PM2: $PM2_BIN"

# PM2 restart can hang when called from a child of the process being restarted.
# Fire-and-forget: background the restart, sleep to let it take effect, then verify.
nohup "$PM2_BIN" restart pushlog-prod --update-env </dev/null >/dev/null 2>&1 &
PM2_PID=$!

# Wait up to 15 seconds for PM2 restart to finish
for i in $(seq 1 15); do
  if ! kill -0 "$PM2_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

# Check if app is running
if "$PM2_BIN" pid pushlog-prod >/dev/null 2>&1; then
  log "PM2 restart succeeded."
else
  log "PM2 restart may have failed. Attempting fresh start..."
  "$PM2_BIN" delete pushlog-prod >/dev/null 2>&1 || true
  nohup "$PM2_BIN" start dist/index.js --name pushlog-prod -i 1 --update-env </dev/null >/dev/null 2>&1 &
  sleep 5
fi

log "Production promotion completed. SHA=${DEPLOYED_SHA}"
