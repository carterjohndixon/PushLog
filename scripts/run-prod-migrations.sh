#!/usr/bin/env bash
# Run required migrations on production database.
# Usage: ./scripts/run-prod-migrations.sh
# Or with explicit URL: DATABASE_URL="postgresql://..." ./scripts/run-prod-migrations.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load prod env if available
if [ -f "$ROOT/.env.production" ]; then
  set -a
  source "$ROOT/.env.production"
  set +a
fi

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not set. Set it in .env.production or pass it explicitly."
  exit 1
fi

echo "Running migrations on database..."
echo ""

# 1. users.open_router_api_key (profile needs this)
echo ">>> migrations/add-openrouter-api-key-users.sql"
psql "$DATABASE_URL" -f "$ROOT/migrations/add-openrouter-api-key-users.sql"
echo ""

# 2. organizations.account_type_chosen_at (profile needs this)
echo ">>> migrations/add-account-type-chosen-at.sql"
psql "$DATABASE_URL" -f "$ROOT/migrations/add-account-type-chosen-at.sql"
echo ""

# 3. Optional: users.openai_api_key (if schema expects it)
if [ -f "$ROOT/migrations/add-openai-api-key-users.sql" ]; then
  echo ">>> migrations/add-openai-api-key-users.sql"
  psql "$DATABASE_URL" -f "$ROOT/migrations/add-openai-api-key-users.sql"
  echo ""
fi

echo "Done. Restart the app to pick up the changes."
