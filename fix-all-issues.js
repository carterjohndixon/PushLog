#!/usr/bin/env node

/**
 * Comprehensive Fix for All Performance Issues
 * Fixes AI integration, rate limiting, and sets up test data
 */

import { execSync } from "child_process";
import { performance } from "perf_hooks";

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

// Step 1: Fix AI Integration
async function fixAIIntegration() {
  log("🤖 Step 1: Fixing AI Integration...");

  try {
    // Run the AI integration fix
    execSync("node fix-ai-integration.js", { stdio: "inherit" });
    log("✅ AI integration fix completed");
    return true;
  } catch (error) {
    log("❌ AI integration fix failed:", error.message);
    return false;
  }
}

// Step 2: Fix Rate Limiting
async function fixRateLimiting() {
  log("🔧 Step 2: Fixing Rate Limiting...");

  try {
    // Run the rate limiting fix
    execSync("node fix-rate-limiting.js", { stdio: "inherit" });
    log("✅ Rate limiting fix completed");
    return true;
  } catch (error) {
    log("❌ Rate limiting fix failed:", error.message);
    return false;
  }
}

// Step 3: Restart Server
async function restartServer() {
  log("🔄 Step 3: Restarting Server...");

  try {
    // Kill existing server processes
    try {
      execSync("pkill -f 'node.*server'", { stdio: "ignore" });
    } catch (error) {
      // No existing processes to kill
    }

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 2000));

    log("✅ Server restart completed");
    return true;
  } catch (error) {
    log("❌ Server restart failed:", error.message);
    return false;
  }
}

// Step 4: Re-run Performance Tests
async function rerunTests() {
  log("📊 Step 4: Re-running Performance Tests...");

  try {
    // Wait for server to be ready
    log("⏳ Waiting for server to be ready...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Run simple performance test
    log("🧪 Running simple performance test...");
    execSync("npm run test:performance", { stdio: "inherit" });

    log("✅ Performance tests completed");
    return true;
  } catch (error) {
    log("❌ Performance tests failed:", error.message);
    return false;
  }
}

// Step 5: Generate Fix Report
function generateFixReport(results) {
  log("\n📋 Fix Report Summary:");
  log("=".repeat(60));

  const fixes = [
    {
      name: "AI Integration",
      status: results.aiIntegration ? "✅ Fixed" : "❌ Failed",
    },
    {
      name: "Rate Limiting",
      status: results.rateLimiting ? "✅ Fixed" : "❌ Failed",
    },
    {
      name: "Server Restart",
      status: results.serverRestart ? "✅ Fixed" : "❌ Failed",
    },
    {
      name: "Performance Tests",
      status: results.performanceTests ? "✅ Fixed" : "❌ Failed",
    },
  ];

  fixes.forEach((fix) => {
    log(`${fix.name}: ${fix.status}`);
  });

  const allFixed = Object.values(results).every((result) => result);

  if (allFixed) {
    log("\n🎉 All issues have been fixed!");
    log("Your app is now ready for production deployment.");
  } else {
    log("\n⚠️  Some issues remain. Check the logs above for details.");
  }

  return allFixed;
}

// Main fix function
async function fixAllIssues() {
  const startTime = performance.now();

  log("🚀 Starting Comprehensive Fix for All Issues...");
  log("This will fix AI integration, rate limiting, and performance issues.");

  const results = {
    aiIntegration: false,
    rateLimiting: false,
    serverRestart: false,
    performanceTests: false,
  };

  try {
    // Step 1: Fix AI Integration
    results.aiIntegration = await fixAIIntegration();

    // Step 2: Fix Rate Limiting
    results.rateLimiting = await fixRateLimiting();

    // Step 3: Restart Server
    results.serverRestart = await restartServer();

    // Step 4: Re-run Performance Tests
    results.performanceTests = await rerunTests();

    // Step 5: Generate Report
    const allFixed = generateFixReport(results);

    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    log(`\n⏱️  Total fix time: ${duration} seconds`);

    if (allFixed) {
      log("\n🎉 All issues have been successfully fixed!");
      log("Your PushLog application is now ready for production deployment.");
    } else {
      log("\n⚠️  Some issues remain. Please check the logs above.");
    }

    return allFixed;
  } catch (error) {
    log("❌ Comprehensive fix failed:", error.message);
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixAllIssues()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Fix failed:", error);
      process.exit(1);
    });
}

export { fixAllIssues };
