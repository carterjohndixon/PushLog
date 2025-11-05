#!/usr/bin/env node

/**
 * PushLog Database Performance Analysis
 * Analyzes database queries, indexes, and performance bottlenecks
 */

import postgres from "postgres";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

const sql = postgres(connectionString);

// Utility functions
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

async function measureQueryTime(queryFn) {
  const start = Date.now();
  const result = await queryFn();
  const duration = Date.now() - start;
  return { result, duration };
}

// Database analysis functions
async function analyzeTableSizes() {
  log("📊 Analyzing table sizes...");

  const { result, duration } = await measureQueryTime(async () => {
    return await sql`
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation,
        most_common_vals,
        most_common_freqs
      FROM pg_stats 
      WHERE schemaname = 'public'
      ORDER BY tablename, attname;
    `;
  });

  log(`✅ Table statistics retrieved in ${duration}ms`);

  // Get table sizes
  const tableSizes = await sql`
    SELECT 
      schemaname,
      tablename,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
      pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
  `;

  log("📋 Table Sizes:");
  tableSizes.forEach((table) => {
    log(`   ${table.tablename}: ${table.size}`);
  });

  return { tableSizes, duration };
}

async function analyzeIndexes() {
  log("🔍 Analyzing database indexes...");

  const { result, duration } = await measureQueryTime(async () => {
    return await sql`
      SELECT 
        t.tablename,
        i.indexname,
        i.indexdef,
        'N/A' as index_size
      FROM pg_tables t
      LEFT JOIN pg_indexes i ON t.tablename = i.tablename
      WHERE t.schemaname = 'public'
      ORDER BY t.tablename, i.indexname;
    `;
  });

  log(`✅ Index analysis completed in ${duration}ms`);

  const indexes = result.filter((row) => row.indexname);
  const tablesWithoutIndexes = result.filter((row) => !row.indexname);

  log(`📋 Found ${indexes.length} indexes:`);
  indexes.forEach((index) => {
    log(`   ${index.tablename}.${index.indexname}: ${index.index_size}`);
  });

  if (tablesWithoutIndexes.length > 0) {
    log(
      `⚠️  Tables without indexes: ${tablesWithoutIndexes
        .map((t) => t.tablename)
        .join(", ")}`
    );
  }

  return { indexes, tablesWithoutIndexes, duration };
}

async function analyzeSlowQueries() {
  log("🐌 Analyzing potentially slow queries...");

  // Test common query patterns
  const queries = [
    {
      name: "User by ID",
      query: () => sql`SELECT * FROM users WHERE id = 1 LIMIT 1`,
    },
    {
      name: "User by Email",
      query: () =>
        sql`SELECT * FROM users WHERE email = 'test@example.com' LIMIT 1`,
    },
    {
      name: "User by GitHub ID",
      query: () => sql`SELECT * FROM users WHERE github_id = '12345' LIMIT 1`,
    },
    {
      name: "Repositories by User",
      query: () => sql`SELECT * FROM repositories WHERE user_id = 1`,
    },
    {
      name: "Integrations by User",
      query: () => sql`SELECT * FROM integrations WHERE user_id = 1`,
    },
    {
      name: "Notifications by User",
      query: () =>
        sql`SELECT * FROM notifications WHERE user_id = 1 ORDER BY created_at DESC LIMIT 10`,
    },
    {
      name: "Push Events by Repository",
      query: () =>
        sql`SELECT * FROM push_events WHERE repository_id = 1 ORDER BY pushed_at DESC LIMIT 10`,
    },
  ];

  const results = [];

  for (const queryTest of queries) {
    const { result, duration } = await measureQueryTime(queryTest.query);
    results.push({
      name: queryTest.name,
      duration,
      rowCount: result.length,
    });

    log(`   ${queryTest.name}: ${duration}ms (${result.length} rows)`);
  }

  const slowQueries = results.filter((r) => r.duration > 100);
  if (slowQueries.length > 0) {
    log(`⚠️  Slow queries detected (>100ms):`);
    slowQueries.forEach((query) => {
      log(`   - ${query.name}: ${query.duration}ms`);
    });
  } else {
    log("✅ All queries performing well (<100ms)");
  }

  return { results, slowQueries };
}

async function analyzeConnectionPool() {
  log("🔗 Analyzing database connection pool...");

  const { result, duration } = await measureQueryTime(async () => {
    return await sql`
      SELECT 
        state,
        COUNT(*) as count
      FROM pg_stat_activity 
      WHERE datname = current_database()
      GROUP BY state;
    `;
  });

  log(`✅ Connection analysis completed in ${duration}ms`);

  log("📋 Connection States:");
  result.forEach((state) => {
    log(`   ${state.state}: ${state.count} connections`);
  });

  return { connectionStates: result, duration };
}

async function suggestOptimizations(tableSizes, indexes, slowQueries) {
  log("\n💡 OPTIMIZATION RECOMMENDATIONS:");
  log("=".repeat(50));

  // Check for missing indexes on frequently queried columns
  const recommendedIndexes = [
    { table: "users", column: "email", reason: "Login queries" },
    { table: "users", column: "github_id", reason: "OAuth lookups" },
    {
      table: "users",
      column: "verification_token",
      reason: "Email verification",
    },
    {
      table: "users",
      column: "reset_password_token",
      reason: "Password reset",
    },
    {
      table: "repositories",
      column: "user_id",
      reason: "User repository queries",
    },
    { table: "repositories", column: "github_id", reason: "Webhook lookups" },
    {
      table: "integrations",
      column: "user_id",
      reason: "User integration queries",
    },
    {
      table: "integrations",
      column: "repository_id",
      reason: "Repository integration queries",
    },
    {
      table: "notifications",
      column: "user_id",
      reason: "User notification queries",
    },
    {
      table: "notifications",
      column: "created_at",
      reason: "Notification ordering",
    },
    {
      table: "push_events",
      column: "repository_id",
      reason: "Repository event queries",
    },
    { table: "push_events", column: "pushed_at", reason: "Event ordering" },
  ];

  const existingIndexes = indexes.map(
    (idx) => `${idx.tablename}.${idx.indexname}`
  );
  const missingIndexes = recommendedIndexes.filter((rec) => {
    const hasIndex = existingIndexes.some(
      (existing) =>
        existing.includes(rec.table) && existing.includes(rec.column)
    );
    return !hasIndex;
  });

  if (missingIndexes.length > 0) {
    log("🔍 Missing indexes that could improve performance:");
    missingIndexes.forEach((idx) => {
      log(
        `   CREATE INDEX idx_${idx.table}_${idx.column} ON ${idx.table}(${idx.column}); -- ${idx.reason}`
      );
    });
  } else {
    log("✅ All recommended indexes are present");
  }

  // Check for large tables that might need partitioning
  const largeTables = tableSizes.filter(
    (table) => table.size_bytes > 100 * 1024 * 1024
  ); // >100MB
  if (largeTables.length > 0) {
    log("📊 Large tables that might benefit from partitioning:");
    largeTables.forEach((table) => {
      log(`   - ${table.tablename}: ${table.size}`);
    });
  }

  // Check for slow queries
  if (slowQueries.length > 0) {
    log("🐌 Slow queries that need optimization:");
    slowQueries.forEach((query) => {
      log(`   - ${query.name}: ${query.duration}ms`);
    });
  }

  // General recommendations
  log("\n🎯 General Performance Recommendations:");
  log("   1. Monitor query performance in production");
  log("   2. Set up database connection pooling");
  log("   3. Consider read replicas for heavy read workloads");
  log("   4. Implement caching for frequently accessed data");
  log("   5. Regular VACUUM and ANALYZE operations");
}

// Main analysis function
async function runDatabaseAnalysis() {
  log("🚀 Starting PushLog Database Performance Analysis...");

  try {
    // Test database connection
    await sql`SELECT 1 as test`;
    log("✅ Database connection successful");

    // Run analysis
    const tableSizes = await analyzeTableSizes();
    const indexes = await analyzeIndexes();
    const slowQueries = await analyzeSlowQueries();
    const connectionPool = await analyzeConnectionPool();

    // Generate recommendations
    await suggestOptimizations(
      tableSizes.tableSizes,
      indexes.indexes,
      slowQueries.slowQueries
    );

    log("\n🎉 Database analysis completed!");

    return {
      tableSizes,
      indexes,
      slowQueries,
      connectionPool,
    };
  } catch (error) {
    log("❌ Database analysis failed:", error.message);
    throw error;
  } finally {
    await sql.end();
  }
}

// Run analysis if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDatabaseAnalysis()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Database analysis failed:", error);
      process.exit(1);
    });
}

export { runDatabaseAnalysis };
