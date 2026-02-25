/**
 * Backfill organizations: create solo org + membership for users missing organizationId,
 * then set organizationId on repos, integrations, slack_workspaces.
 *
 * Run after db:push (once new tables and columns exist):
 *   npx tsx scripts/backfill-organizations.ts
 *
 * Safe to run multiple times (idempotent for users who already have organizationId).
 */
import { databaseStorage } from "../server/database";

async function main() {
  console.log("Running organizations backfill...");
  const result = await databaseStorage.runBackfillOrganizations();
  console.log("Backfill complete:", result);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
