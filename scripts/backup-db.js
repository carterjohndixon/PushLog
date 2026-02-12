#!/usr/bin/env node
/**
 * One-off PostgreSQL backup using pg_dump.
 * Reads DATABASE_URL from .env and writes a timestamped SQL dump to backups/.
 *
 * Usage: npm run db:backup
 * Requires: pg_dump on PATH (install Postgres client tools if needed).
 */

import { execSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(__dirname, "..");
dotenv.config({ path: join(projectRoot, ".env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

const backupsDir = join(projectRoot, "backups");
if (!existsSync(backupsDir)) {
  mkdirSync(backupsDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outFile = join(backupsDir, `pushlog_backup_${timestamp}.sql`);

// pg_dump must be same or newer than server. Prefer PG_DUMP env; then Homebrew postgresql@17
const pgDump =
  process.env.PG_DUMP ||
  (existsSync("/opt/homebrew/opt/postgresql@17/bin/pg_dump") &&
    "/opt/homebrew/opt/postgresql@17/bin/pg_dump") ||
  (existsSync("/usr/local/opt/postgresql@17/bin/pg_dump") &&
    "/usr/local/opt/postgresql@17/bin/pg_dump") ||
  "pg_dump";

try {
  execSync(`"${pgDump}" "${url}" --no-owner --no-acl -f "${outFile}"`, {
    stdio: "inherit",
    shell: true,
  });
  console.log("\nBackup written to:", outFile);
} catch (err) {
  const msg = err?.message ?? "";
  if (msg.includes("version mismatch")) {
    console.error(
      "pg_dump must be >= server version. Install PostgreSQL 17 client, then:\n" +
        "  brew install postgresql@17\n" +
        '  PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" npm run db:backup\n' +
        "Or: PG_DUMP=/opt/homebrew/opt/postgresql@17/bin/pg_dump npm run db:backup",
    );
  } else {
    console.error(
      "Backup failed. Is pg_dump installed and DATABASE_URL correct?",
    );
  }
  process.exit(1);
}
