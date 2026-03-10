#!/bin/bash
# Send a signed test payload to a PushLog Sentry webhook URL.
# Usage: ./scripts/test-sentry-webhook.sh <WEBHOOK_URL> <SECRET>
# Example: ./scripts/test-sentry-webhook.sh "https://staging.pushlog.ai/api/webhooks/sentry/pls_xxx" "your_secret"

set -e
URL="${1:?Usage: $0 <WEBHOOK_URL> <SECRET>}"
SECRET="${2:?Usage: $0 <WEBHOOK_URL> <SECRET>}"

BODY='{"action":"test","installation":{"uuid":"test"}}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
SIG_HEADER="sha256=$SIG"

echo "POST $URL"
echo "Body: $BODY"
echo ""

curl -v -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Sentry-Hook-Signature: $SIG_HEADER" \
  -d "$BODY"

echo ""
echo "---"
echo "202 = success. If you see a notification in PushLog, the webhook is active."
