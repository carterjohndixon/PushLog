#!/bin/bash
# Build artifacts for Docker staging ONLY. Does not touch the repo's dist/ so production
# (if it runs from this repo) is unchanged until you promote via Admin.
# Run on your dev machine or on EC2 in a staging-only directory; then docker compose.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f "scripts/lib-rust-incremental.sh" ]; then
  # shellcheck source=scripts/lib-rust-incremental.sh
  source "scripts/lib-rust-incremental.sh"
fi
if command -v pushlog_maybe_cargo_release >/dev/null 2>&1; then
  pushlog_maybe_cargo_release incident-engine incident-engine server/incident-engine echo
else
  echo "Building incident-engine..."
  cargo build --release -p incident-engine
fi

echo "Building Node app for staging (isolated — does not overwrite dist/)..."
STAGING_BUILD=".docker-build/staging-build"
rm -rf "$STAGING_BUILD"
mkdir -p "$STAGING_BUILD"
# Copy source and config; exclude node_modules, .git, dist, and build artifacts
rsync -a --exclude=node_modules --exclude=.git --exclude=dist --exclude=.docker-build --exclude=target --exclude=.env --exclude=.env.* --exclude=carter.pushlog.ai/node_modules --exclude=carter.pushlog.ai/dist . "$STAGING_BUILD/"
(cd "$STAGING_BUILD" && npm ci && \
  (npm audit --audit-level=high || { echo "High/critical vulnerabilities detected. Running npm audit fix..."; npm audit fix; }) || true && \
  npm run build)

echo "Preparing Docker build context..."
rm -rf .docker-build/prebuilt
mkdir -p .docker-build/prebuilt/bin
cp package.json package-lock.json .docker-build/prebuilt/
cp -r "$STAGING_BUILD/dist" .docker-build/prebuilt/
# Ensure source map is present for stack trace symbolication in incidents (dist/index.js → server/*.ts)
if [ ! -f ".docker-build/prebuilt/dist/index.js.map" ]; then
  echo "Warning: dist/index.js.map missing; incident stack traces will show bundled lines. Check that npm run build uses --sourcemap."
fi
cp target/release/incident-engine .docker-build/prebuilt/bin/

# Cache-bust: use git SHA or timestamp so each deploy produces a unique build (avoids stale Docker layers)
CACHEBUST="${CACHEBUST:-$(git rev-parse HEAD 2>/dev/null || date +%s)}"
echo "Docker cache-bust: $CACHEBUST"
cat > .docker-build/prebuilt/Dockerfile << 'DOCKERFILE'
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ARG CACHEBUST
RUN echo "Build: ${CACHEBUST:-unknown}"
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY bin/incident-engine /app/bin/incident-engine
RUN echo "${CACHEBUST:-unknown}" > /app/.staging_deployed_sha && date -u +"%Y-%m-%dT%H:%M:%SZ" > /app/.staging_deployed_at
ENV SOURCE_COMMIT=${CACHEBUST:-unknown}
EXPOSE 3001
CMD ["node", "dist/index.js"]
DOCKERFILE

echo ""
echo "Done. This script did not modify ./dist — production is unchanged until you promote from Admin."
echo ""
echo "On EC2:"
echo "  1. rsync .docker-build/prebuilt (or git pull if committed)"
echo "  2. docker compose -f docker-compose.staging.yml -f docker-compose.prebuilt.yml up -d --build"
echo ""