#!/bin/bash

# AI and Billing Test Runner
# This script helps you get your JWT token and run the tests

echo "🧪 AI and Billing Test Runner"
echo "=============================="
echo ""

# Check if token is provided as argument
if [ $# -eq 0 ]; then
    echo "❌ No token provided!"
    echo ""
    echo "Usage: ./run-tests.sh YOUR_JWT_TOKEN"
    echo ""
    echo "To get your token:"
    echo "1. Open your app in browser (http://localhost:5173)"
    echo "2. Open Developer Tools (F12)"
    echo "3. Go to Console tab"
    echo "4. Run: localStorage.getItem('token')"
    echo "5. Copy the token and run: ./run-tests.sh YOUR_TOKEN"
    echo ""
    exit 1
fi

TOKEN=$1

echo "🔑 Using token: ${TOKEN:0:20}..."
echo ""

# Run the test script
node test-ai-billing.js "$TOKEN"
