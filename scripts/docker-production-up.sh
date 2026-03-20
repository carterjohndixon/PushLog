#!/usr/bin/env bash
# Start PushLog production stack: prune stopped containers, ensure prod network, then compose up.
# Run from anywhere: ./scripts/docker-production-up.sh [-- extra compose args]
#
# Requires external network pushlog_prod (see docker-compose.production.yml).
# Optional: COMPOSE_PROJECT_NAME=pushlog (default)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pushlog}"
PROD_COMPOSE="${PROD_COMPOSE:-docker-compose.production.yml}"
PROD_NETWORK_NAME="${PROD_NETWORK_NAME:-pushlog_prod}"

echo "==> [production] Pruning stopped containers (docker container prune -f)..."
docker container prune -f

if ! docker network inspect "${PROD_NETWORK_NAME}" >/dev/null 2>&1; then
  echo "==> [production] Creating Docker network ${PROD_NETWORK_NAME}..."
  docker network create "${PROD_NETWORK_NAME}"
else
  echo "==> [production] Network ${PROD_NETWORK_NAME} already exists."
fi

echo "==> [production] docker compose -p ${COMPOSE_PROJECT_NAME} -f ${PROD_COMPOSE} up -d --build $@"
docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${PROD_COMPOSE}" up -d --build "$@"

echo "==> [production] Done."
docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${PROD_COMPOSE}" ps
