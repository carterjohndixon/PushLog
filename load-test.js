#!/usr/bin/env node

/**
 * PushLog Load Testing Suite
 * Tests application performance under various load conditions
 */

import fetch from "node-fetch";
import { performance } from "perf_hooks";

// Configuration
const BASE_URL = process.env.TEST_URL || "https://8081fea9884d.ngrok-free.app";

// Load test scenarios
const LOAD_SCENARIOS = [
  {
    name: "Light Load",
    concurrentUsers: 5,
    requestsPerUser: 10,
    duration: 30000, // 30 seconds
  },
  {
    name: "Medium Load",
    concurrentUsers: 15,
    requestsPerUser: 20,
    duration: 60000, // 60 seconds
  },
  {
    name: "Heavy Load",
    concurrentUsers: 30,
    requestsPerUser: 30,
    duration: 120000, // 120 seconds
  },
];

// Test endpoints
const TEST_ENDPOINTS = [
  { path: "/health", method: "GET", weight: 0.3 },
  { path: "/health/detailed", method: "GET", weight: 0.2 },
  { path: "/api/profile", method: "GET", weight: 0.2, requiresAuth: true },
  {
    path: "/api/integrations",
    method: "GET",
    weight: 0.15,
    requiresAuth: true,
  },
  {
    path: "/api/notifications/unread",
    method: "GET",
    weight: 0.15,
    requiresAuth: true,
  },
];

// Performance metrics
const metrics = {
  requests: [],
  errors: [],
  startTime: null,
  endTime: null,
};

// Utility functions
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

function getRandomEndpoint() {
  const random = Math.random();
  let cumulative = 0;

  for (const endpoint of TEST_ENDPOINTS) {
    cumulative += endpoint.weight;
    if (random <= cumulative) {
      return endpoint;
    }
  }

  return TEST_ENDPOINTS[0]; // fallback
}

async function makeRequest(endpoint, authToken = null) {
  const start = performance.now();

  try {
    const url = `${BASE_URL}${endpoint.path}`;
    const options = {
      method: endpoint.method,
      headers: {
        "Content-Type": "application/json",
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      },
    };

    const response = await fetch(url, options);
    const end = performance.now();
    const duration = end - start;

    const isSuccess = response.status >= 200 && response.status < 300;

    const requestData = {
      endpoint: endpoint.path,
      method: endpoint.method,
      status: response.status,
      duration,
      success: isSuccess,
      timestamp: new Date(),
    };

    metrics.requests.push(requestData);

    if (!isSuccess) {
      metrics.errors.push({
        ...requestData,
        error: `HTTP ${response.status}`,
      });
    }

    return requestData;
  } catch (error) {
    const end = performance.now();
    const duration = end - start;

    const requestData = {
      endpoint: endpoint.path,
      method: endpoint.method,
      status: "ERROR",
      duration,
      success: false,
      timestamp: new Date(),
      error: error.message,
    };

    metrics.requests.push(requestData);
    metrics.errors.push(requestData);

    return requestData;
  }
}

async function simulateUser(userId, scenario, authToken = null) {
  const userRequests = [];
  const endTime = Date.now() + scenario.duration;

  while (
    Date.now() < endTime &&
    userRequests.length < scenario.requestsPerUser
  ) {
    const endpoint = getRandomEndpoint();

    // Skip auth-required endpoints if no token
    if (endpoint.requiresAuth && !authToken) {
      continue;
    }

    const request = await makeRequest(endpoint, authToken);
    userRequests.push(request);

    // Random delay between requests (100-500ms)
    const delay = Math.random() * 400 + 100;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return userRequests;
}

async function runLoadTest(scenario) {
  log(`🚀 Starting ${scenario.name} test...`);
  log(`👥 Concurrent users: ${scenario.concurrentUsers}`);
  log(`📊 Requests per user: ${scenario.requestsPerUser}`);
  log(`⏱️  Duration: ${scenario.duration / 1000}s`);

  metrics.startTime = Date.now();

  // Create user sessions (simplified - in real test you'd create actual users)
  const userPromises = [];

  for (let i = 0; i < scenario.concurrentUsers; i++) {
    userPromises.push(simulateUser(i, scenario));
  }

  // Wait for all users to complete
  const userResults = await Promise.all(userPromises);

  metrics.endTime = Date.now();

  // Calculate metrics
  const totalDuration = metrics.endTime - metrics.startTime;
  const totalRequests = metrics.requests.length;
  const successfulRequests = metrics.requests.filter((r) => r.success).length;
  const failedRequests = totalRequests - successfulRequests;
  const successRate = (successfulRequests / totalRequests) * 100;

  const responseTimes = metrics.requests.map((r) => r.duration);
  const avgResponseTime =
    responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  const maxResponseTime = Math.max(...responseTimes);
  const minResponseTime = Math.min(...responseTimes);

  // Calculate percentiles
  const sortedTimes = responseTimes.sort((a, b) => a - b);
  const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];

  const requestsPerSecond = totalRequests / (totalDuration / 1000);

  log(`\n📊 ${scenario.name} Results:`);
  log("=".repeat(50));
  log(`✅ Total requests: ${totalRequests}`);
  log(`✅ Successful: ${successfulRequests}`);
  log(`❌ Failed: ${failedRequests}`);
  log(`📈 Success rate: ${successRate.toFixed(2)}%`);
  log(`⏱️  Average response time: ${avgResponseTime.toFixed(2)}ms`);
  log(`⚡ Min response time: ${minResponseTime.toFixed(2)}ms`);
  log(`🐌 Max response time: ${maxResponseTime.toFixed(2)}ms`);
  log(`📊 50th percentile: ${p50.toFixed(2)}ms`);
  log(`📊 95th percentile: ${p95.toFixed(2)}ms`);
  log(`📊 99th percentile: ${p99.toFixed(2)}ms`);
  log(`🚀 Requests/second: ${requestsPerSecond.toFixed(2)}`);

  // Performance analysis
  log(`\n💡 ${scenario.name} Analysis:`);
  log("-".repeat(30));

  if (successRate < 95) {
    log("⚠️  Low success rate detected");
  } else {
    log("✅ Good success rate");
  }

  if (avgResponseTime > 1000) {
    log("⚠️  High average response time detected");
  } else {
    log("✅ Good average response time");
  }

  if (p95 > 2000) {
    log("⚠️  High 95th percentile response time");
  } else {
    log("✅ Good 95th percentile response time");
  }

  if (requestsPerSecond < 10) {
    log("⚠️  Low throughput detected");
  } else {
    log("✅ Good throughput");
  }

  return {
    scenario: scenario.name,
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate,
    avgResponseTime,
    maxResponseTime,
    minResponseTime,
    p50,
    p95,
    p99,
    requestsPerSecond,
    totalDuration,
  };
}

async function runAllLoadTests() {
  log("🚀 Starting PushLog Load Testing Suite...");
  log(`📍 Testing against: ${BASE_URL}`);

  const results = [];

  for (const scenario of LOAD_SCENARIOS) {
    // Reset metrics for each scenario
    metrics.requests = [];
    metrics.errors = [];
    metrics.startTime = null;
    metrics.endTime = null;

    const result = await runLoadTest(scenario);
    results.push(result);

    // Wait 30 seconds between tests
    if (scenario !== LOAD_SCENARIOS[LOAD_SCENARIOS.length - 1]) {
      log("\n⏳ Waiting 30 seconds before next test...");
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }

  // Overall analysis
  log("\n🏆 OVERALL LOAD TEST ANALYSIS:");
  log("=".repeat(60));

  results.forEach((result) => {
    log(`\n📊 ${result.scenario}:`);
    log(`   Success Rate: ${result.successRate.toFixed(2)}%`);
    log(`   Avg Response: ${result.avgResponseTime.toFixed(2)}ms`);
    log(`   95th Percentile: ${result.p95.toFixed(2)}ms`);
    log(`   Throughput: ${result.requestsPerSecond.toFixed(2)} req/s`);
  });

  // Performance recommendations
  log("\n💡 LOAD TEST RECOMMENDATIONS:");
  log("=".repeat(50));

  const heavyLoadResult = results.find((r) => r.scenario === "Heavy Load");
  if (heavyLoadResult) {
    if (heavyLoadResult.successRate < 90) {
      log("⚠️  Heavy load test shows low success rate");
      log(
        "   Consider: Load balancing, auto-scaling, or performance optimization"
      );
    }

    if (heavyLoadResult.avgResponseTime > 2000) {
      log("⚠️  Heavy load test shows high response times");
      log("   Consider: Database optimization, caching, or CDN");
    }

    if (heavyLoadResult.requestsPerSecond < 20) {
      log("⚠️  Heavy load test shows low throughput");
      log(
        "   Consider: Server scaling, connection pooling, or architecture review"
      );
    }
  }

  log("\n🎉 Load testing completed!");

  return results;
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllLoadTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Load test runner failed:", error);
      process.exit(1);
    });
}

export { runAllLoadTests };
