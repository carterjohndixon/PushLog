#!/bin/bash

# PushLog Auto-Deployment Script
# This script is triggered by GitHub webhook to automatically deploy changes

set -e  # Exit on any error

# Configuration
APP_DIR="${APP_DIR:-/var/www/pushlog}"
BRANCH="${DEPLOY_BRANCH:-main}"
LOG_FILE="${APP_DIR}/deploy.log"
# Delay (seconds) before pull/restart so in-flight push webhooks can finish (OpenAI + Slack ~10-20s)
DEPLOY_DELAY="${DEPLOY_DELAY:-25}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if we're in the app directory
if [ ! -d "$APP_DIR" ]; then
    log_error "App directory not found: $APP_DIR"
    exit 1
fi

cd "$APP_DIR"

log_info "Starting deployment..."
log_info "Current directory: $(pwd)"
log_info "Branch: $BRANCH"

# Wait so any in-flight push webhook (AI summary + Slack) can complete before we restart PM2
if [ -n "$DEPLOY_DELAY" ] && [ "$DEPLOY_DELAY" -gt 0 ] 2>/dev/null; then
    log_info "Waiting ${DEPLOY_DELAY}s for in-flight webhooks to finish..."
    sleep "$DEPLOY_DELAY"
fi

# Fetch latest changes
log_info "Fetching latest changes from GitHub..."
git fetch origin "$BRANCH" || {
    log_error "Failed to fetch from GitHub"
    exit 1
}

# Check if there are any changes
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH)

if [ "$LOCAL" = "$REMOTE" ]; then
    log_info "Already up to date. No deployment needed."
    exit 0
fi

log_info "New changes detected. Updating to origin/$BRANCH..."
git reset --hard "origin/$BRANCH" || {
    log_error "Failed to update from GitHub"
    git status || true
    exit 1
}

# Install/update dependencies (including devDependencies needed for build)
log_info "Installing dependencies..."
npm install --include=dev || {
    log_error "Failed to install dependencies"
    exit 1
}

# Build the application
log_info "Building application..."
npm run build || {
    log_error "Build failed"
    exit 1
}

# Build streaming-stats (Rust)
log_info "Building streaming-stats..."
cargo build --release -p streaming-stats || {
    log_error "Failed to build streaming-stats"
    exit 1
}

# Restart Docker staging services (staging uses containers, not PM2)
COMPOSE_FILE="${APP_DIR}/docker-compose.staging.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    log_error "docker-compose file not found: $COMPOSE_FILE"
    exit 1
fi

log_info "Deploying staging Docker services..."
if ! docker compose -f "$COMPOSE_FILE" up -d --build staging-db staging-app; then
    log_error "Staging Docker deploy failed. Pruning Docker cache/garbage and retrying once..."
    docker container prune -f || true
    docker image prune -f || true
    docker builder prune -f || true

    if ! docker compose -f "$COMPOSE_FILE" up -d --build staging-db staging-app; then
        log_error "Staging Docker deploy failed after prune/retry."
        docker compose -f "$COMPOSE_FILE" ps || true
        docker compose -f "$COMPOSE_FILE" logs --tail=200 staging-app || true
        exit 1
    fi
fi

# Wait a moment for the apps to start
sleep 2

# Check if Docker staging app is running
if docker compose -f "$COMPOSE_FILE" ps --status running | grep -q "staging-app"; then
    log_success "Deployment completed successfully!"
else
    log_error "Staging deployment failed to start. Check Docker logs."
    docker compose -f "$COMPOSE_FILE" ps || true
    docker compose -f "$COMPOSE_FILE" logs --tail=200 staging-app || true
    exit 1
fi

log_info "Deployment finished at $(date)"

