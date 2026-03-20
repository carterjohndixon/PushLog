#!/usr/bin/env bash
# Start PushLog staging stack: prune stopped containers, then docker compose up.
# Run from anywhere: ./scripts/docker-staging-up.sh [-- extra compose args]
#
# Optional: COMPOSE_PROJECT_NAME=pushlog (default matches typical `docker compose ls`)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pushlog}"
STAGING_COMPOSE="${STAGING_COMPOSE:-docker-compose.staging.yml}"

echo "==> [staging] Pruning stopped containers (docker container prune -f)..."
docker container prune -f

echo "==> [staging] docker compose -p ${COMPOSE_PROJECT_NAME} -f ${STAGING_COMPOSE} up -d --build $@"
docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${STAGING_COMPOSE}" up -d --build "$@"

echo "==> [staging] Done."
docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${STAGING_COMPOSE}" ps
