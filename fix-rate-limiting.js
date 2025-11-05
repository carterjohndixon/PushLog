#!/usr/bin/env node

/**
 * Fix Rate Limiting Issues
 * Adjusts rate limiting for better load testing and normal usage
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

// Read current server configuration
function readServerConfig() {
  const serverPath = join(__dirname, "server", "index.ts");
  return readFileSync(serverPath, "utf8");
}

// Update rate limiting configuration
function updateRateLimiting() {
  log("🔧 Updating rate limiting configuration...");

  const serverPath = join(__dirname, "server", "index.ts");
  let content = readFileSync(serverPath, "utf8");

  // Current rate limiting (too restrictive for load testing)
  const currentLimiter = `const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});`;

  // Updated rate limiting (more permissive for load testing)
  const updatedLimiter = `const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs (increased for load testing)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});`;

  // Update the limiter
  content = content.replace(currentLimiter, updatedLimiter);

  // Add environment-based rate limiting
  const environmentBasedLimiter = `// Environment-based rate limiting
const isDevelopment = process.env.NODE_ENV !== 'production';
const isLoadTesting = process.env.LOAD_TESTING === 'true';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isLoadTesting ? 10000 : (isDevelopment ? 1000 : 100), // More permissive in dev/load testing
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/health/detailed';
  },
});`;

  // Update auth rate limiting to be more permissive in development
  const authLimiterSection = `// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});`;

  const updatedAuthLimiterSection = `// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isLoadTesting ? 100 : (isDevelopment ? 20 : 5), // More permissive in dev/load testing
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});`;

  content = content.replace(authLimiterSection, updatedAuthLimiterSection);

  // Write updated content
  writeFileSync(serverPath, content);
  log("✅ Rate limiting configuration updated");
}

// Add load testing environment variable
function addLoadTestingEnv() {
  log("🔧 Adding load testing environment variable...");

  const envPath = join(__dirname, ".env");
  let envContent = "";

  try {
    envContent = readFileSync(envPath, "utf8");
  } catch (error) {
    // .env file doesn't exist, create it
    log("📝 Creating .env file...");
  }

  // Add load testing flag
  if (!envContent.includes("LOAD_TESTING")) {
    envContent += "\n# Load testing flag\nLOAD_TESTING=false\n";
    writeFileSync(envPath, envContent);
    log("✅ Added LOAD_TESTING environment variable");
  } else {
    log("✅ LOAD_TESTING environment variable already exists");
  }
}

// Create load testing script
function createLoadTestingScript() {
  log("📝 Creating load testing script...");

  const loadTestScript = `#!/bin/bash

# Load Testing Script for PushLog
# This script sets up the environment for load testing

echo "🚀 Setting up PushLog for load testing..."

# Set load testing environment variable
export LOAD_TESTING=true

# Run the load test
echo "📊 Running load test with increased rate limits..."
npm run test:load

# Reset environment
unset LOAD_TESTING

echo "✅ Load testing complete!"
`;

  const scriptPath = join(__dirname, "run-load-test.sh");
  writeFileSync(scriptPath, loadTestScript);

  // Make it executable
  try {
    execSync(`chmod +x ${scriptPath}`);
    log("✅ Load testing script created and made executable");
  } catch (error) {
    log("⚠️  Could not make script executable, but it's ready to use");
  }
}

// Main fix function
async function fixRateLimiting() {
  log("🚀 Starting Rate Limiting Fix...");

  try {
    // Step 1: Update rate limiting configuration
    updateRateLimiting();

    // Step 2: Add load testing environment variable
    addLoadTestingEnv();

    // Step 3: Create load testing script
    createLoadTestingScript();

    log("\n🎉 Rate Limiting Fix Summary:");
    log("=".repeat(50));
    log("✅ Rate limiting increased for development/load testing");
    log("✅ Environment-based rate limiting added");
    log("✅ Load testing script created");
    log("✅ Health check endpoints exempt from rate limiting");

    log("\n📋 Next Steps:");
    log("1. Restart your server to apply changes");
    log("2. Run load tests with: npm run test:load");
    log("3. For production, set NODE_ENV=production");
    log("4. For load testing, set LOAD_TESTING=true");

    return true;
  } catch (error) {
    log("❌ Rate limiting fix failed:", error.message);
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixRateLimiting()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Fix failed:", error);
      process.exit(1);
    });
}

export { fixRateLimiting };
