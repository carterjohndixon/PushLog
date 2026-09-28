#!/bin/bash
#
# Redeploy staging when its branch has new commits. Meant for cron on the staging server:
#
#   */2 * * * * /opt/pushlog-staging/scripts/staging-autodeploy.sh >> /var/log/pushlog-staging-autodeploy.log 2>&1
#
# It only ever pulls into this checkout and runs scripts/staging-up.sh, so it cannot push
# anything or touch production — unlike the retired GitHub workflow, which reached into
# whatever directory it was pointed at.
set -euo pipefail

cd "$(dirname "$0")/.."

# A build takes longer than the cron interval; never start a second deploy on top of one.
exec 9>.staging-autodeploy.lock
flock -n 9 || exit 0

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch --quiet origin "$BRANCH"

if [ "$(git rev-parse HEAD)" = "$(git rev-parse FETCH_HEAD)" ]; then
  exit 0
fi

echo "[staging-autodeploy] $(date -u +%FT%TZ) $(git rev-parse --short HEAD) -> $(git rev-parse --short FETCH_HEAD)"
./scripts/staging-up.sh
