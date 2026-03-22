#!/usr/bin/env node

/**
 * Add Performance Indexes Script
 * Safely adds database indexes to improve query performance
 */

import postgres from "postgres";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

// Use SSL only when connecting to Supabase (or DATABASE_SSL=true). Local Docker does not support SSL.
const useSsl =
  process.env.DATABASE_SSL === "true" ||
  process.env.DATABASE_SSL === "1" ||
  /supabase\.(co|com)/i.test(connectionString);

const sql = postgres(connectionString, {
  ...(useSsl
    ? {
        // nosemgrep: problem-based-packs.insecure-transport.js-node.bypass-tls-verification.bypass-tls-verification, gitlab.nodejs_scan.javascript-crypto-rule-node_tls_reject
        ssl: { rejectUnauthorized: false },
      }
    : {}),
});

// Utility functions
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

async function addIndexes() {
  log("🚀 Starting database index creation...");

  try {
    // Read the SQL file
    const sqlFile = path.join(__dirname, "add-performance-indexes.sql");
    const sqlContent = fs.readFileSync(sqlFile, "utf8");

    // Split into individual statements
    const statements = sqlContent
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

    log(`📋 Found ${statements.length} index statements to execute`);

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
        successCount++;
        log(`✅ Index created successfully`);
      } catch (error) {
        if (error.message.includes("already exists")) {
          log(`⚠️  Index already exists (skipping)`);
          successCount++;
        } else {
          log(`❌ Failed to create index: ${error.message}`);
          errorCount++;
        }
      }
    }

    log("\n📊 INDEX CREATION SUMMARY:");
    log("=".repeat(40));
    log(`✅ Successful: ${successCount}`);
    log(`❌ Failed: ${errorCount}`);
    log(`📈 Total: ${statements.length}`);

    if (errorCount === 0) {
      log("\n🎉 All indexes created successfully!");
      log("💡 Your database performance should be significantly improved!");
    } else {
      log("\n⚠️  Some indexes failed to create. Check the errors above.");
    }
  } catch (error) {
    log("❌ Index creation failed:", error.message);
    throw error;
  } finally {
    await sql.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addIndexes()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Index creation failed:", error);
      process.exit(1);
    });
}

export { addIndexes };
