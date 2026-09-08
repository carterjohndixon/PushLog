#!/bin/bash
#
# Deploy staging from whatever this checkout's origin is.
#
# Staging tracks carterjohndixon/PushLog so it can be tested before anything reaches
# the org repo that production deploys from. Run it from the staging checkout:
#
#   cd /opt/pushlog-staging && ./scripts/staging-up.sh
#
# The one thing this exists to guarantee is CACHEBUST. It is baked into the image as
# /app/.staging_deployed_sha, which is the only way the admin page learns what staging
# is actually running; deploy by hand without it and the page reports "unknown" and
# falls back to showing the wrong commit.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"
PROJECT="${STAGING_COMPOSE_PROJECT:-pushlog-staging}"

log() { echo "[staging-up] $1"; }

if [ ! -f .env.staging ]; then
  log "ERROR: .env.staging not found in ${REPO_DIR}."
  exit 1
fi

# Modified tracked files mean the built image would not match any commit, so the SHA we
# record would be a lie — the precise failure this script exists to prevent. Untracked
# files are ignored: a stray file someone left in the directory is not a code change, and
# blocking on it just teaches people to skip the script.
if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  log "ERROR: tracked files have uncommitted changes; commit or stash them first."
  git status --short --untracked-files=no
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "Pulling ${BRANCH} from $(git remote get-url origin)..."
git pull --ff-only origin "$BRANCH"

CACHEBUST="$(git rev-parse HEAD)"
export CACHEBUST
log "Deploying ${CACHEBUST:0:10} — $(git log -1 --pretty=%s)"

log "Building (this takes a while)..."
./scripts/build-for-docker.sh

log "Starting containers (project: ${PROJECT})..."
docker compose -p "$PROJECT" --env-file .env.staging \
  -f docker-compose.staging.yml -f docker-compose.prebuilt.yml up -d --build

# Host-side copies for anything reading the repo directory rather than the image.
echo "$CACHEBUST" > "${REPO_DIR}/.staging_deployed_sha"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "${REPO_DIR}/.staging_deployed_at"

log "Done. Staging is on ${CACHEBUST:0:10}."
log "Verify: docker exec pushlog-staging-app cat /app/.staging_deployed_sha"
