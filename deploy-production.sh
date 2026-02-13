#!/bin/bash

# PushLog Production Promotion Script
# Trigger manually (or via staging admin endpoint) after staging approval.

set -e

APP_DIR="${APP_DIR:-/var/www/pushlog}"
LOG_FILE="${APP_DIR}/deploy-production.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
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
restart_pm2() {
  # Prevent rare PM2 hangs from blocking promotions forever.
  timeout 30s /usr/bin/pm2 restart pushlog-prod --update-env
}

if ! restart_pm2; then
  log "PM2 restart timed out/failed. Retrying once..."
  if ! restart_pm2; then
    log "PM2 restart failed twice. Attempting fresh start path..."
    /usr/bin/pm2 delete pushlog-prod >/dev/null 2>&1 || true
    timeout 30s /usr/bin/pm2 start dist/index.js --name pushlog-prod -i 1 --update-env
  fi
fi

# Metadata writes should not fail the whole deployment.
DEPLOYED_SHA="$(git rev-parse HEAD 2>/dev/null || echo "unknown")"
DEPLOYED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo "$DEPLOYED_SHA" > "${APP_DIR}/.prod_deployed_sha" || true
echo "$DEPLOYED_AT" > "${APP_DIR}/.prod_deployed_at" || true

log "Production promotion completed. SHA=${DEPLOYED_SHA}"
