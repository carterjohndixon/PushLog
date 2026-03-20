#!/usr/bin/env bash
# Start PushLog staging stack: prune stopped containers, then docker compose up.
# Run from anywhere: ./scripts/docker-staging-up.sh [-- extra compose args]
#
# Optional: COMPOSE_PROJECT_NAME=pushlog (default matches typical `docker compose ls`)
# Optional: STAGING_ENV_FILE=path (default: repo root .env.staging)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pushlog}"
STAGING_COMPOSE="${STAGING_COMPOSE:-docker-compose.staging.yml}"

if [[ -z "${STAGING_ENV_FILE:-}" ]]; then
  STAGING_ENV_FILE="${ROOT}/.env.staging"
elif [[ "${STAGING_ENV_FILE}" != /* ]]; then
  STAGING_ENV_FILE="${ROOT}/${STAGING_ENV_FILE}"
fi
if [[ ! -f "${STAGING_ENV_FILE}" ]]; then
  echo "error: env file not found: ${STAGING_ENV_FILE}" >&2
  echo "       Create .env.staging at repo root or set STAGING_ENV_FILE." >&2
  exit 1
fi

echo "==> [staging] Pruning stopped containers (docker container prune -f)..."
docker container prune -f

echo "==> [staging] Using env file: ${STAGING_ENV_FILE}"
echo "==> [staging] docker compose --env-file ... -p ${COMPOSE_PROJECT_NAME} -f ${STAGING_COMPOSE} up -d --build $@"
docker compose --env-file "${STAGING_ENV_FILE}" -p "${COMPOSE_PROJECT_NAME}" -f "${STAGING_COMPOSE}" up -d --build "$@"

echo "==> [staging] Done."
docker compose --env-file "${STAGING_ENV_FILE}" -p "${COMPOSE_PROJECT_NAME}" -f "${STAGING_COMPOSE}" ps
