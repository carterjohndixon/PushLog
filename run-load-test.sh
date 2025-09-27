#!/bin/bash

# Load Testing Script for PushLog
# This script sets up the environment for load testing

echo "🚀 Setting up PushLog for load testing..."

# Set load testing environment variable
export LOAD_TESTING=true

# Run the load test
echo "📊 Running load test with increased rate limits..."
npm run test:load

# Reset environment
unset LOAD_TESTING

echo "✅ Load testing complete!"
