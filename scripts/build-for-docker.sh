#!/bin/bash
# Build artifacts locally so EC2 only runs a lightweight Docker build (npm ci --omit=dev only).
# Run on your dev machine, then rsync to EC2 and run docker compose.
set -e
cd "$(dirname "$0")/.."

echo "Building Node app..."
npm run build

echo "Building incident-engine..."
cargo build --release -p incident-engine

echo "Preparing Docker build context..."
rm -rf .docker-build/prebuilt
mkdir -p .docker-build/prebuilt/bin
cp package.json package-lock.json .docker-build/prebuilt/
cp -r dist .docker-build/prebuilt/
cp target/release/incident-engine .docker-build/prebuilt/bin/

cat > .docker-build/prebuilt/Dockerfile << 'DOCKERFILE'
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY bin/incident-engine /app/bin/incident-engine
EXPOSE 3001
CMD ["node", "dist/index.js"]
DOCKERFILE

echo "Done. On EC2:"
echo "  1. rsync .docker-build/prebuilt (or git pull if committed)"
echo "  2. docker compose -f docker-compose.staging.yml -f docker-compose.prebuilt.yml up -d --build"
