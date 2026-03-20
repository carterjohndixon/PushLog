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
# Must match the Compose project name you use on this host (`docker compose ls`).
# Set COMPOSE_PROJECT_NAME in .env.production or the promote container env (e.g. workspace).
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pushlog}"
PROD_NETWORK_NAME="${PROD_NETWORK_NAME:-pushlog_prod}"
# Fixed container_name values from docker-compose.production.yml (remove before up to avoid name conflicts).
PROD_FIXED_CONTAINERS=(
  pushlog-prod-web
  pushlog-prod-streaming-stats
  pushlog-agent
)

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
GIT_LOG="${WORKSPACE}/deploy-production-git.log"
if [ -d .git ]; then
  log "Fetching from origin..."
  git fetch origin >> "$GIT_LOG" 2>&1 || log "Warning: git fetch failed, continuing with existing refs."

  if [ -n "${PROMOTED_SHA:-}" ]; then
    TARGET_FULL="$(git rev-parse "$PROMOTED_SHA" 2>/dev/null || true)"
    if [ -z "$TARGET_FULL" ]; then
      log "ERROR: Commit $PROMOTED_SHA not found. Try: git fetch origin main"
      exit 1
    fi
    CURRENT="$(git rev-parse HEAD 2>/dev/null || true)"
    if [ "$CURRENT" != "$TARGET_FULL" ]; then
      log "Checking out target SHA: ${TARGET_FULL:0:10}..."
      git checkout "$TARGET_FULL" >> "$GIT_LOG" 2>&1 || { log "ERROR: Failed to checkout"; exit 1; }
    else
      log "Already at target SHA ${TARGET_FULL:0:10}."
    fi
  else
    log "No target SHA; pulling latest main..."
    git checkout main >> "$GIT_LOG" 2>&1 && git pull origin main >> "$GIT_LOG" 2>&1 || log "Warning: pull failed, building from current HEAD"
  fi
  log "Git operations complete. HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
fi

DOCKER_LOG="${WORKSPACE}/deploy-production-docker.log"

# ── Shared prod network (compose treats it as external) ──
log "Ensuring Docker network ${PROD_NETWORK_NAME} exists..."
if ! docker network inspect "$PROD_NETWORK_NAME" >/dev/null 2>&1; then
  docker network create "$PROD_NETWORK_NAME" >> "$DOCKER_LOG" 2>&1 || { log "ERROR: Could not create network $PROD_NETWORK_NAME"; exit 1; }
  log "  Created network $PROD_NETWORK_NAME"
else
  log "  Network $PROD_NETWORK_NAME already exists"
fi

# ── Remove fixed-name containers (any compose project / leftover duplicates) ──
log "Removing conflicting production containers (if any)..."
for cname in "${PROD_FIXED_CONTAINERS[@]}"; do
  if docker inspect "$cname" >/dev/null 2>&1; then
    log "  docker rm -f $cname"
    docker rm -f "$cname" >> "$DOCKER_LOG" 2>&1 || true
  fi
done

# ── Drop production stack only (keeps external network + named volumes) ──
# IMPORTANT: Do NOT use --remove-orphans here. Staging often uses the same
# COMPOSE_PROJECT_NAME (e.g. pushlog) with docker-compose.staging.yml; orphans would
# include every staging + pushlog-promote container and this script would nuke the host.
log "docker compose -p $COMPOSE_PROJECT_NAME down (production file only, no --remove-orphans) ..."
docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" down >> "$DOCKER_LOG" 2>&1 || true

# ── Rebuild and restart production containers ──
log "Rebuilding and restarting (compose project=$COMPOSE_PROJECT_NAME)..."
# Same: no --remove-orphans on up — would delete staging/promote as "orphans" of this file set.
if ! docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" up -d --build --force-recreate >> "$DOCKER_LOG" 2>&1; then
  log "ERROR: docker compose up failed. See deploy-production-docker.log for details."
  tail -20 "$DOCKER_LOG" | while IFS= read -r line; do log "  $line"; done
  exit 1
fi
log "Docker containers rebuilt successfully."

# ── Light cleanup: dangling images, stopped containers, unused networks (not volumes) ──
if [ "${DOCKER_PROMOTE_PRUNE:-true}" = "true" ]; then
  log "docker system prune -f (quick cleanup, preserves volumes)..."
  docker system prune -f >> "$DOCKER_LOG" 2>&1 || true
fi

# ── Write deployed metadata ──
DEPLOYED_SHA="$(git rev-parse HEAD 2>/dev/null || echo "${PROMOTED_SHA:-unknown}")"
DEPLOYED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "$DEPLOYED_SHA" > "$SHA_FILE" || true
echo "$DEPLOYED_AT" > "$AT_FILE" || true

log "Production promotion completed. SHA=${DEPLOYED_SHA}"
