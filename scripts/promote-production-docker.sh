#!/bin/bash
# PushLog Production Promotion (Docker)
# Runs inside the promote container with workspace + docker socket mounted.
# Replaces deploy-production.sh when using Docker instead of PM2.

set -e
trap '' HUP

WORKSPACE="${PROMOTE_WORKSPACE:-/workspace}"
LOG_FILE="${WORKSPACE}/deploy-production.log"
LOCK_FILE="${WORKSPACE}/.promote-production.lock"
SHA_FILE="${WORKSPACE}/.prod_deployed_sha"
AT_FILE="${WORKSPACE}/.prod_deployed_at"
COMPOSE_FILE="${WORKSPACE}/docker-compose.production.yml"

cleanup() {
  rm -f "$LOCK_FILE" 2>/dev/null || true
}
trap cleanup EXIT

log() {
  echo "[$(TZ='America/Los_Angeles' date '+%Y-%m-%d %I:%M:%S %p %Z')] $1" | tee -a "$LOG_FILE"
}

if [ ! -d "$WORKSPACE" ]; then
  log "ERROR: Workspace not found: $WORKSPACE"
  exit 1
fi

cd "$WORKSPACE" || { log "ERROR: Cannot cd to $WORKSPACE"; exit 1; }

log "Starting production promotion (Docker)..."
log "Working directory: $(pwd)"
log "Triggered by: ${PROMOTED_BY:-unknown}"
log "Target SHA: ${PROMOTED_SHA:-<not specified, will use latest main>}"

# ── Fetch and checkout target SHA ──
if [ -d .git ]; then
  log "Fetching from origin..."
  git fetch origin >> "$LOG_FILE" 2>&1 || log "Warning: git fetch failed, continuing with existing refs."

  if [ -n "${PROMOTED_SHA:-}" ]; then
    TARGET_FULL="$(git rev-parse "$PROMOTED_SHA" 2>/dev/null || true)"
    if [ -z "$TARGET_FULL" ]; then
      log "ERROR: Commit $PROMOTED_SHA not found. Try: git fetch origin main"
      exit 1
    fi
    CURRENT="$(git rev-parse HEAD 2>/dev/null || true)"
    if [ "$CURRENT" != "$TARGET_FULL" ]; then
      log "Checking out target SHA: ${TARGET_FULL:0:10}..."
      git checkout "$TARGET_FULL" >> "$LOG_FILE" 2>&1 || { log "ERROR: Failed to checkout"; exit 1; }
    else
      log "Already at target SHA ${TARGET_FULL:0:10}."
    fi
  else
    log "No target SHA; pulling latest main..."
    git checkout main >> "$LOG_FILE" 2>&1 && git pull origin main >> "$LOG_FILE" 2>&1 || log "Warning: pull failed, building from current HEAD"
  fi
fi

# ── Remove orphan containers from previous compose projects ──
log "Cleaning up any orphan containers..."
for cname in pushlog-prod-web pushlog-agent; do
  if docker inspect "$cname" >/dev/null 2>&1; then
    log "  Removing existing container: $cname"
    docker stop "$cname" >> "$LOG_FILE" 2>&1 || true
    docker rm -f "$cname" >> "$LOG_FILE" 2>&1 || true
  fi
done

# ── Rebuild and restart production containers ──
log "Rebuilding and restarting Docker production containers..."
if ! docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate --remove-orphans >> "$LOG_FILE" 2>&1; then
  log "ERROR: docker compose up failed. Check deploy-production.log"
  exit 1
fi

# ── Write deployed metadata ──
DEPLOYED_SHA="$(git rev-parse HEAD 2>/dev/null || echo "${PROMOTED_SHA:-unknown}")"
DEPLOYED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "$DEPLOYED_SHA" > "$SHA_FILE" || true
echo "$DEPLOYED_AT" > "$AT_FILE" || true

log "Production promotion completed. SHA=${DEPLOYED_SHA}"
