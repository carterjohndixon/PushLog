#!/usr/bin/env node

/**
 * PushLog Performance Testing Suite
 * Tests API endpoints, database queries, and concurrent user scenarios
 */

import fetch from "node-fetch";
import { performance } from "perf_hooks";

// Configuration
const BASE_URL = process.env.TEST_URL || "https://8081fea9884d.ngrok-free.app";
const CONCURRENT_USERS = 10;
const REQUESTS_PER_USER = 5;

// Test data
const testUser = {
  username: `perftest_${Date.now()}`,
  email: `perftest_${Date.now()}@example.com`,
  password: "TestPassword123!",
};

let authToken = null;
let userId = null;

// Utility functions
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

function measureTime(fn) {
  return async (...args) => {
    const start = performance.now();
    const result = await fn(...args);
    const end = performance.now();
    return { result, duration: end - start };
  };
}

// API request helper
async function apiRequest(method, endpoint, data = null, token = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...(data && { body: JSON.stringify(data) }),
  };

  const response = await fetch(url, options);
  const responseData = await response.json();

  return {
    status: response.status,
    data: responseData,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

// Test functions
async function testUserSignup() {
  log("🧪 Testing user signup performance...");

  const { result, duration } = await measureTime(apiRequest)(
    "POST",
    "/api/signup",
    testUser
  );

  log(`✅ Signup completed in ${duration.toFixed(2)}ms`, {
    status: result.status,
    success: result.status === 200,
  });

  if (result.status === 200) {
    authToken = result.data.token;
    userId = result.data.user.id;
  }

  return { success: result.status === 200, duration };
}

async function testUserLogin() {
  log("🧪 Testing user login performance...");

  const { result, duration } = await measureTime(apiRequest)(
    "POST",
    "/api/login",
    { identifier: testUser.email, password: testUser.password }
  );

  log(`✅ Login completed in ${duration.toFixed(2)}ms`, {
    status: result.status,
    success: result.status === 200,
  });

  return { success: result.status === 200, duration };
}

async function testProfileEndpoint() {
  log("🧪 Testing profile endpoint performance...");

  const { result, duration } = await measureTime(apiRequest)(
    "GET",
    "/api/profile",
    null,
    authToken
  );

  log(`✅ Profile fetch completed in ${duration.toFixed(2)}ms`, {
    status: result.status,
    success: result.status === 200,
  });

  return { success: result.status === 200, duration };
}

async function testIntegrationsEndpoint() {
  log("🧪 Testing integrations endpoint performance...");

  const { result, duration } = await measureTime(apiRequest)(
    "GET",
    "/api/integrations",
    null,
    authToken
  );

  log(`✅ Integrations fetch completed in ${duration.toFixed(2)}ms`, {
    status: result.status,
    success: result.status === 200,
  });

  return { success: result.status === 200, duration };
}

async function testNotificationsEndpoint() {
  log("🧪 Testing notifications endpoint performance...");

  const { result, duration } = await measureTime(apiRequest)(
    "GET",
    "/api/notifications/unread",
    null,
    authToken
  );

  log(`✅ Notifications fetch completed in ${duration.toFixed(2)}ms`, {
    status: result.status,
    success: result.status === 200,
  });

  return { success: result.status === 200, duration };
}

async function testHealthEndpoint() {
  log("🧪 Testing health endpoint performance...");

  const { result, duration } = await measureTime(apiRequest)("GET", "/health");

  log(`✅ Health check completed in ${duration.toFixed(2)}ms`, {
    status: result.status,
    success: result.status === 200,
  });

  return { success: result.status === 200, duration };
}

async function testConcurrentRequests() {
  log(
    `🧪 Testing ${CONCURRENT_USERS} concurrent users with ${REQUESTS_PER_USER} requests each...`
  );

  const promises = [];
  const startTime = performance.now();

  for (let user = 0; user < CONCURRENT_USERS; user++) {
    for (let request = 0; request < REQUESTS_PER_USER; request++) {
      promises.push(
        measureTime(apiRequest)("GET", "/api/profile", null, authToken)
      );
    }
  }

  const results = await Promise.all(promises);
  const endTime = performance.now();
  const totalDuration = endTime - startTime;

  const successful = results.filter((r) => r.result.status === 200).length;
  const failed = results.length - successful;
  const avgResponseTime =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  log(`✅ Concurrent test completed in ${totalDuration.toFixed(2)}ms`, {
    totalRequests: results.length,
    successful,
    failed,
    averageResponseTime: avgResponseTime.toFixed(2) + "ms",
    requestsPerSecond: (results.length / (totalDuration / 1000)).toFixed(2),
  });

  return {
    totalRequests: results.length,
    successful,
    failed,
    averageResponseTime: avgResponseTime,
    totalDuration,
    requestsPerSecond: results.length / (totalDuration / 1000),
  };
}

async function testDatabasePerformance() {
  log("🧪 Testing database performance...");

  // Test multiple profile requests to measure database query performance
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(
      measureTime(apiRequest)("GET", "/api/profile", null, authToken)
    );
  }

  const results = await Promise.all(promises);
  const avgDbTime =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  log(`✅ Database performance test completed`, {
    averageQueryTime: avgDbTime.toFixed(2) + "ms",
    totalQueries: results.length,
  });

  return { averageQueryTime: avgDbTime, totalQueries: results.length };
}

// Main test runner
async function runPerformanceTests() {
  log("🚀 Starting PushLog Performance Tests...");
  log(`📍 Testing against: ${BASE_URL}`);

  const results = {
    signup: null,
    login: null,
    profile: null,
    integrations: null,
    notifications: null,
    health: null,
    concurrent: null,
    database: null,
  };

  try {
    // Basic endpoint tests
    results.signup = await testUserSignup();
    if (!results.signup.success) {
      log("❌ Signup failed, skipping authenticated tests");
      return results;
    }

    results.login = await testUserLogin();
    results.profile = await testProfileEndpoint();
    results.integrations = await testIntegrationsEndpoint();
    results.notifications = await testNotificationsEndpoint();
    results.health = await testHealthEndpoint();

    // Performance tests
    results.concurrent = await testConcurrentRequests();
    results.database = await testDatabasePerformance();

    // Performance analysis
    log("\n📊 PERFORMANCE ANALYSIS:");
    log("=".repeat(50));

    const endpointTests = [
      { name: "Signup", result: results.signup },
      { name: "Login", result: results.login },
      { name: "Profile", result: results.profile },
      { name: "Integrations", result: results.integrations },
      { name: "Notifications", result: results.notifications },
      { name: "Health Check", result: results.health },
    ];

    endpointTests.forEach((test) => {
      if (test.result) {
        const status = test.result.success ? "✅" : "❌";
        log(`${status} ${test.name}: ${test.result.duration.toFixed(2)}ms`);
      }
    });

    if (results.concurrent) {
      log("\n🔄 CONCURRENT PERFORMANCE:");
      log(`✅ Total Requests: ${results.concurrent.totalRequests}`);
      log(`✅ Successful: ${results.concurrent.successful}`);
      log(`✅ Failed: ${results.concurrent.failed}`);
      log(
        `✅ Average Response Time: ${results.concurrent.averageResponseTime.toFixed(
          2
        )}ms`
      );
      log(
        `✅ Requests/Second: ${results.concurrent.requestsPerSecond.toFixed(2)}`
      );
    }

    if (results.database) {
      log("\n🗄️ DATABASE PERFORMANCE:");
      log(
        `✅ Average Query Time: ${results.database.averageQueryTime.toFixed(
          2
        )}ms`
      );
      log(`✅ Total Queries: ${results.database.totalQueries}`);
    }

    // Performance recommendations
    log("\n💡 PERFORMANCE RECOMMENDATIONS:");
    log("=".repeat(50));

    const slowEndpoints = endpointTests.filter(
      (test) => test.result && test.result.duration > 1000
    );

    if (slowEndpoints.length > 0) {
      log("⚠️  Slow endpoints detected (>1000ms):");
      slowEndpoints.forEach((test) => {
        log(`   - ${test.name}: ${test.result.duration.toFixed(2)}ms`);
      });
    } else {
      log("✅ All endpoints performing well (<1000ms)");
    }

    if (results.concurrent && results.concurrent.averageResponseTime > 500) {
      log("⚠️  High concurrent response times detected");
      log(
        "   Consider: Database connection pooling, caching, or load balancing"
      );
    }

    if (results.database && results.database.averageQueryTime > 100) {
      log("⚠️  Slow database queries detected");
      log("   Consider: Database indexing, query optimization, or caching");
    }

    log("\n🎉 Performance testing completed!");
  } catch (error) {
    log("❌ Performance test failed:", error.message);
  }

  return results;
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPerformanceTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Test runner failed:", error);
      process.exit(1);
    });
}

export { runPerformanceTests };
