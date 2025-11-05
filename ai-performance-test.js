#!/usr/bin/env node

/**
 * AI Integration Performance Test
 * Tests AI model performance, credit deduction, and response times
 */

import fetch from "node-fetch";
import { performance } from "perf_hooks";

// Configuration
const BASE_URL = process.env.TEST_URL || "https://8081fea9884d.ngrok-free.app";

// Test data
const testUser = {
  username: `aitest_${Date.now()}`,
  email: `aitest_${Date.now()}@example.com`,
  password: "TestPassword123!",
};

// AI models to test
const AI_MODELS = [
  { name: "GPT-3.5 Turbo", model: "gpt-3.5-turbo", expectedSpeed: "fast" },
  { name: "GPT-4", model: "gpt-4", expectedSpeed: "medium" },
  { name: "GPT-4 Turbo", model: "gpt-4-turbo", expectedSpeed: "fast" },
];

// Test scenarios
const TEST_SCENARIOS = [
  {
    name: "Small Code Change",
    description: "Simple bug fix or small feature",
    expectedTokens: 100,
    expectedCost: 0.0001,
  },
  {
    name: "Medium Code Change",
    description: "Feature implementation with multiple files",
    expectedTokens: 500,
    expectedCost: 0.0005,
  },
  {
    name: "Large Code Change",
    description: "Major refactoring or new feature",
    expectedTokens: 1000,
    expectedCost: 0.001,
  },
];

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
async function setupTestUser() {
  log("👤 Setting up test user for AI testing...");

  const signupResult = await apiRequest("POST", "/api/signup", testUser);
  if (signupResult.status === 200) {
    authToken = signupResult.data.token;
    userId = signupResult.data.user.id;
    log("✅ Test user created successfully");
    return true;
  } else {
    log("❌ Failed to create test user:", signupResult.data);
    return false;
  }
}

async function testAIModelPerformance(model) {
  log(`🤖 Testing ${model.name} performance...`);

  const { result, duration } = await measureTime(apiRequest)(
    "POST",
    "/api/test-ai-summary/1",
    { model: model.model },
    authToken
  );

  const success = result.status === 200;
  const responseTime = duration;

  log(`✅ ${model.name} completed in ${duration.toFixed(2)}ms`, {
    status: result.status,
    success,
    responseTime,
    model: model.model,
  });

  return {
    model: model.name,
    success,
    duration,
    status: result.status,
    data: result.data,
  };
}

async function testCreditDeduction() {
  log("💰 Testing AI credit deduction system...");

  // Get initial credits
  const profileBefore = await apiRequest(
    "GET",
    "/api/profile",
    null,
    authToken
  );
  const initialCredits = profileBefore.data?.user?.aiCredits || 0;

  log(`📊 Initial credits: ${initialCredits}`);

  // Test AI summary generation
  const { result, duration } = await measureTime(apiRequest)(
    "POST",
    "/api/test-ai-summary/1",
    {},
    authToken
  );

  // Get credits after AI usage
  const profileAfter = await apiRequest("GET", "/api/profile", null, authToken);
  const finalCredits = profileAfter.data?.user?.aiCredits || 0;
  const creditsDeducted = initialCredits - finalCredits;

  log(`💰 Credit deduction test completed in ${duration.toFixed(2)}ms`, {
    initialCredits,
    finalCredits,
    creditsDeducted,
    aiTestSuccess: result.status === 200,
  });

  return {
    success: result.status === 200,
    duration,
    creditsDeducted,
    initialCredits,
    finalCredits,
  };
}

async function testAIModelComparison() {
  log("🔄 Testing AI model comparison...");

  const results = [];

  for (const model of AI_MODELS) {
    const result = await testAIModelPerformance(model);
    results.push(result);

    // Wait 2 seconds between model tests
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return results;
}

async function testConcurrentAIRequests() {
  log("⚡ Testing concurrent AI requests...");

  const promises = [];
  const startTime = performance.now();

  // Send 5 concurrent AI requests
  for (let i = 0; i < 5; i++) {
    promises.push(
      measureTime(apiRequest)("POST", "/api/test-ai-summary/1", {}, authToken)
    );
  }

  const results = await Promise.all(promises);
  const endTime = performance.now();
  const totalDuration = endTime - startTime;

  const successful = results.filter((r) => r.result.status === 200).length;
  const failed = results.length - successful;
  const avgResponseTime =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  log(`⚡ Concurrent AI test completed in ${totalDuration.toFixed(2)}ms`, {
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

async function testAIErrorHandling() {
  log("🚫 Testing AI error handling...");

  const errorTests = [
    {
      name: "Invalid model",
      test: () =>
        apiRequest(
          "POST",
          "/api/test-ai-summary/1",
          { model: "invalid-model" },
          authToken
        ),
    },
    {
      name: "Missing integration",
      test: () => apiRequest("POST", "/api/test-ai-summary/999", {}, authToken),
    },
    {
      name: "Unauthenticated request",
      test: () => apiRequest("POST", "/api/test-ai-summary/1", {}),
    },
  ];

  const results = [];

  for (const test of errorTests) {
    const { result, duration } = await measureTime(test.test);
    const expectedFailure = result.status !== 200;

    results.push({
      name: test.name,
      success: expectedFailure,
      duration,
      status: result.status,
    });

    log(
      `🚫 ${test.name}: ${expectedFailure ? "✅" : "❌"} (${duration.toFixed(
        2
      )}ms)`
    );
  }

  return results;
}

// Main test runner
async function runAIPerformanceTests() {
  log("🚀 Starting AI Integration Performance Tests...");
  log(`📍 Testing against: ${BASE_URL}`);

  const results = {
    userSetup: null,
    modelComparison: null,
    creditDeduction: null,
    concurrentRequests: null,
    errorHandling: null,
  };

  try {
    // Setup
    results.userSetup = await setupTestUser();
    if (!results.userSetup) {
      log("❌ User setup failed, skipping AI tests");
      return results;
    }

    // AI performance tests
    results.modelComparison = await testAIModelComparison();
    results.creditDeduction = await testCreditDeduction();
    results.concurrentRequests = await testConcurrentAIRequests();
    results.errorHandling = await testAIErrorHandling();

    // AI analysis
    log("\n🤖 AI PERFORMANCE ANALYSIS:");
    log("=".repeat(50));

    if (results.modelComparison) {
      log("📊 Model Performance:");
      results.modelComparison.forEach((model) => {
        const status = model.success ? "✅" : "❌";
        log(`   ${status} ${model.model}: ${model.duration.toFixed(2)}ms`);
      });
    }

    if (results.creditDeduction) {
      log("\n💰 Credit System:");
      log(`   Credits deducted: ${results.creditDeduction.creditsDeducted}`);
      log(`   Initial credits: ${results.creditDeduction.initialCredits}`);
      log(`   Final credits: ${results.creditDeduction.finalCredits}`);
    }

    if (results.concurrentRequests) {
      log("\n⚡ Concurrent Performance:");
      log(`   Total requests: ${results.concurrentRequests.totalRequests}`);
      log(`   Successful: ${results.concurrentRequests.successful}`);
      log(`   Failed: ${results.concurrentRequests.failed}`);
      log(
        `   Average response time: ${results.concurrentRequests.averageResponseTime.toFixed(
          2
        )}ms`
      );
      log(
        `   Requests/second: ${results.concurrentRequests.requestsPerSecond.toFixed(
          2
        )}`
      );
    }

    if (results.errorHandling) {
      log("\n🚫 Error Handling:");
      results.errorHandling.forEach((test) => {
        const status = test.success ? "✅" : "❌";
        log(`   ${status} ${test.name}: ${test.duration.toFixed(2)}ms`);
      });
    }

    // AI recommendations
    log("\n💡 AI PERFORMANCE RECOMMENDATIONS:");
    log("=".repeat(50));

    const slowModels = results.modelComparison?.filter(
      (model) => model.duration > 5000
    );
    if (slowModels && slowModels.length > 0) {
      log("⚠️  Slow AI models detected (>5s):");
      slowModels.forEach((model) => {
        log(`   - ${model.model}: ${model.duration.toFixed(2)}ms`);
      });
    } else {
      log("✅ All AI models performing well (<5s)");
    }

    if (
      results.creditDeduction &&
      results.creditDeduction.creditsDeducted > 0
    ) {
      log("✅ Credit deduction system working correctly");
    } else {
      log("⚠️  Credit deduction may not be working properly");
    }

    if (
      results.concurrentRequests &&
      results.concurrentRequests.averageResponseTime > 3000
    ) {
      log("⚠️  High concurrent AI response times detected");
      log("   Consider: AI request queuing, caching, or load balancing");
    }

    log("\n🎉 AI performance testing completed!");
  } catch (error) {
    log("❌ AI performance test failed:", error.message);
  }

  return results;
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAIPerformanceTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("AI performance test runner failed:", error);
      process.exit(1);
    });
}

export { runAIPerformanceTests };
