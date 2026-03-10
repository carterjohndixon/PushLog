#!/bin/bash
# Measure endpoint response times for Settings page loads.
# Usage:
#   ./scripts/test-endpoint-timing.sh [BASE_URL] [COOKIE]
#
# To get your session cookie: open DevTools → Application → Cookies → copy "connect.sid" value.
# Example:
#   ./scripts/test-endpoint-timing.sh https://staging.pushlog.ai "connect.sid=s%3A..."
#   ./scripts/test-endpoint-timing.sh http://localhost:5001 "connect.sid=..."

BASE_URL="${1:-http://localhost:5001}"
COOKIE="${2:-}"

if [ -z "$COOKIE" ]; then
  echo "Usage: $0 BASE_URL COOKIE"
  echo ""
  echo "COOKIE: Your session cookie (e.g. connect.sid=xxx)."
  echo "  Get it from: DevTools → Application → Cookies → connect.sid"
  echo ""
  echo "Example:"
  echo "  $0 http://localhost:5001 'connect.sid=s%3Aabc123...'"
  exit 1
fi

echo "Testing endpoints against $BASE_URL"
echo ""

time_request() {
  local name="$1"
  local url="$2"
  local start
  local end
  start=$(date +%s%3N)
  http_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE" -H "Accept: application/json" "$url")
  end=$(date +%s%3N)
  duration=$((end - start))
  printf "  %-35s %4dms  HTTP %s\n" "$name" "$duration" "$http_code"
}

time_request "/api/profile"                    "$BASE_URL/api/profile"
time_request "/api/org"                        "$BASE_URL/api/org"
time_request "/api/account/data-summary"       "$BASE_URL/api/account/data-summary"
time_request "/api/slack/workspaces"           "$BASE_URL/api/slack/workspaces"
time_request "/api/agents"                     "$BASE_URL/api/agents"
time_request "/api/org/sentry-apps"             "$BASE_URL/api/org/sentry-apps"

echo ""
echo "Done. For server-side breakdown, run with LOG_PERF=1 and check server logs."
