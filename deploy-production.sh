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

log "Installing dependencies..."
npm install --include=dev

log "Building production bundle..."
npm run build:production

log "Restarting production PM2 app..."
/usr/bin/pm2 restart pushlog-prod || /usr/bin/pm2 start ecosystem.config.js --only pushlog-prod

git rev-parse HEAD > "${APP_DIR}/.prod_deployed_sha"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "${APP_DIR}/.prod_deployed_at"

log "Production promotion completed. SHA=$(cat "${APP_DIR}/.prod_deployed_sha")"
