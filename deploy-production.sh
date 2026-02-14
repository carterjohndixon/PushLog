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
  echo "[$(TZ='America/Los_Angeles' date '+%Y-%m-%d %H:%M:%S %Z')] $1" | tee -a "$LOG_FILE"
}

if [ ! -d "$APP_DIR" ]; then
  log "ERROR: App directory not found: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"
log "Starting production promotion..."
log "Triggered by: ${PROMOTED_BY:-unknown}"

# Install deps only when lockfile changed or node_modules missing.
if [ ! -d node_modules ] || [ ! -f .deps_installed_for ] || [ package-lock.json -nt .deps_installed_for ]; then
  log "Installing dependencies..."
  npm install --include=dev
  cp package-lock.json .deps_installed_for
else
  log "Dependencies unchanged, skipping npm install."
fi

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
