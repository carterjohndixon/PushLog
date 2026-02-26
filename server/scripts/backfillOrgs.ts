/**
 * Backfill organizations: create org + membership for users missing organizationId,
 * then set organizationId on repos, integrations, slack_workspaces.
 *
 * Run after db:push (once new tables and columns exist):
 *   npm run db:backfill-orgs
 *
 * For production/staging DB, load the right env first so ENCRYPTION_KEY and DATABASE_URL are set:
 *   APP_ENV=production npm run db:backfill-orgs
 *   APP_ENV=staging   npm run db:backfill-orgs
 *
 * Re-runnable and idempotent (skips rows already set).
 * Exits non-zero if any users, repositories, or integrations still have null organizationId.
 * Slack workspaces with null org (e.g. orphan rows whose user no longer exists) are reported but do not fail the script.
 */
import { databaseStorage } from "../database";

async function main() {
  console.log("Running organizations backfill...");
  const result = await databaseStorage.runBackfillOrganizations();
  console.log("Backfill complete:", result);

  const remaining = await databaseStorage.getRemainingNullOrgCounts();
  console.log("Remaining null organizationId counts:", remaining);

  const critical = remaining.users + remaining.repositories + remaining.integrations;
  if (critical > 0) {
    console.error("Some users, repositories, or integrations still have null organizationId. Fix and re-run.");
    process.exit(1);
  }
  if (remaining.slackWorkspaces > 0) {
    console.warn(
      `${remaining.slackWorkspaces} slack_workspace(s) still have null organizationId (e.g. workspace owned by deleted user). You can fix or ignore.`
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
