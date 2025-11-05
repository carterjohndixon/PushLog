#!/usr/bin/env node

/**
 * Simple PushLog Performance Test
 * Tests basic endpoint connectivity and response times
 */

import fetch from "node-fetch";
import { performance } from "perf_hooks";

// Configuration
const BASE_URL = "http://localhost:5001"; // Test against local server
const TEST_ENDPOINTS = ["/health", "/health/detailed"];

// Utility functions
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

async function testEndpoint(endpoint) {
  const start = performance.now();

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const end = performance.now();
    const duration = end - start;

    const isSuccess = response.status >= 200 && response.status < 300;

    log(`✅ ${endpoint}: ${duration.toFixed(2)}ms (${response.status})`);

    return {
      endpoint,
      success: isSuccess,
      duration,
      status: response.status,
    };
  } catch (error) {
    const end = performance.now();
    const duration = end - start;

    log(`❌ ${endpoint}: ${duration.toFixed(2)}ms (ERROR: ${error.message})`);

    return {
      endpoint,
      success: false,
      duration,
      status: "ERROR",
      error: error.message,
    };
  }
}

async function runSimplePerformanceTest() {
  log("🚀 Starting Simple PushLog Performance Test...");
  log(`📍 Testing against: ${BASE_URL}`);

  const results = [];

  for (const endpoint of TEST_ENDPOINTS) {
    const result = await testEndpoint(endpoint);
    results.push(result);

    // Wait 1 second between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Summary
  log("\n📊 PERFORMANCE SUMMARY:");
  log("=".repeat(40));

  const successful = results.filter((r) => r.success).length;
  const failed = results.length - successful;
  const avgResponseTime =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  log(`✅ Successful requests: ${successful}`);
  log(`❌ Failed requests: ${failed}`);
  log(`⏱️  Average response time: ${avgResponseTime.toFixed(2)}ms`);

  if (successful === results.length) {
    log("🎉 All endpoints are responding correctly!");
  } else {
    log("⚠️  Some endpoints failed. Check if your server is running.");
  }

  return results;
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSimplePerformanceTest()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Test failed:", error);
      process.exit(1);
    });
}

export { runSimplePerformanceTest };
