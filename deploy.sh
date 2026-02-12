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

# Restart PM2 applications
log_info "Restarting PM2 applications..."
/usr/bin/pm2 restart pushlog-prod || /usr/bin/pm2 start ecosystem.config.js --only pushlog-prod || {
    log_error "Failed to restart pushlog-prod"
    exit 1
}
/usr/bin/pm2 restart pushlog-staging || /usr/bin/pm2 start ecosystem.config.js --only pushlog-staging || {
    log_error "Failed to restart pushlog-staging"
    exit 1
}
/usr/bin/pm2 restart streaming-stats 2>/dev/null || /usr/bin/pm2 start ecosystem.config.js --only streaming-stats

# Wait a moment for the apps to start
sleep 2

# Check if PM2 processes are running
if /usr/bin/pm2 list | grep -q "pushlog-prod.*online" && /usr/bin/pm2 list | grep -q "pushlog-staging.*online" && /usr/bin/pm2 list | grep -q "streaming-stats.*online"; then
    log_success "Deployment completed successfully!"
else
    log_error "Application failed to start. Check PM2 logs: pm2 logs"
    exit 1
fi

log_info "Deployment finished at $(date)"

