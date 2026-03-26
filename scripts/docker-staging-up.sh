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
# Include promote by default so `docker-staging-up.sh` rebuilds pushlog-promote (staging → prod webhook).
# Set STAGING_INCLUDE_PROMOTE=0 to skip if you don't use .env.production on this machine.
STAGING_INCLUDE_PROMOTE="${STAGING_INCLUDE_PROMOTE:-1}"

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

PROMOTE_COMPOSE_ARGS=()
if [[ "${STAGING_INCLUDE_PROMOTE}" == "1" ]]; then
  if [[ ! -f "${ROOT}/.env.production" ]]; then
    echo "warn: ${ROOT}/.env.production not found — skipping docker-compose.promote.yml (pushlog-promote will not be started)." >&2
    echo "      Create .env.production or set STAGING_INCLUDE_PROMOTE=0 to silence this." >&2
  else
    PROMOTE_COMPOSE_ARGS=(-f "${ROOT}/docker-compose.promote.yml")
  fi
fi

echo "==> [staging] Pruning stopped containers (docker container prune -f)..."
docker container prune -f

echo "==> [staging] Using env file: ${STAGING_ENV_FILE}"
if ((${#PROMOTE_COMPOSE_ARGS[@]})); then
  echo "==> [staging] Also applying docker-compose.promote.yml (pushlog-promote)"
fi
docker compose --env-file "${STAGING_ENV_FILE}" -p "${COMPOSE_PROJECT_NAME}" \
  -f "${STAGING_COMPOSE}" \
  "${PROMOTE_COMPOSE_ARGS[@]}" \
  up -d --build "$@"

echo "==> [staging] Done."
docker compose --env-file "${STAGING_ENV_FILE}" -p "${COMPOSE_PROJECT_NAME}" \
  -f "${STAGING_COMPOSE}" \
  "${PROMOTE_COMPOSE_ARGS[@]}" \
  ps
