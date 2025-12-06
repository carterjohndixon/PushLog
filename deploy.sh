#!/bin/bash

# PushLog Auto-Deployment Script
# This script is triggered by GitHub webhook to automatically deploy changes

set -e  # Exit on any error

# Configuration
APP_DIR="${APP_DIR:-/var/www/pushlog}"
BRANCH="${DEPLOY_BRANCH:-main}"
LOG_FILE="${APP_DIR}/deploy.log"

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

log_info "New changes detected. Pulling latest code..."
git pull origin "$BRANCH" || {
    log_error "Failed to pull from GitHub"
    exit 1
}

# Install/update dependencies (including devDependencies needed for build)
log_info "Installing dependencies..."
npm install || {
    log_error "Failed to install dependencies"
    exit 1
}

# Build the application
log_info "Building application..."
npm run build || {
    log_error "Build failed"
    exit 1
}

# Restart PM2 application
log_info "Restarting PM2 application..."
pm2 restart pushlog || {
    log_error "Failed to restart PM2 application"
    exit 1
}

# Wait a moment for the app to start
sleep 2

# Check if PM2 process is running
if pm2 list | grep -q "pushlog.*online"; then
    log_success "Deployment completed successfully!"
    log_info "Application is running"
else
    log_error "Application failed to start. Check PM2 logs: pm2 logs pushlog"
    exit 1
fi

log_info "Deployment finished at $(date)"

