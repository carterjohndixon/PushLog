#!/usr/bin/env bash
# Start PushLog staging stack: prune stopped containers, then docker compose up.
# Run from anywhere: ./scripts/docker-staging-up.sh [-- extra compose args]
#
# Optional: COMPOSE_PROJECT_NAME=pushlog-staging (must match scripts/staging-up.sh — production
#           owns the "pushlog" project, and reusing it collides on container names such as
#           pushlog-staging-db and mounts a different, empty DB volume)
# Optional: STAGING_ENV_FILE=path (default: repo root .env.staging)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pushlog-staging}"
STAGING_COMPOSE="${STAGING_COMPOSE:-docker-compose.staging.yml}"
# pushlog-promote belongs to the production project, so bringing it up under the staging
# project collides on its container name. Set STAGING_INCLUDE_PROMOTE=1 only on a machine
# where staging and promote share a project.
STAGING_INCLUDE_PROMOTE="${STAGING_INCLUDE_PROMOTE:-0}"

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
