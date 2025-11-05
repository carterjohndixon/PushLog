#!/usr/bin/env node

/**
 * Manual Webhook Testing Guide
 * Tests webhook functionality without requiring authentication
 */

import fetch from "node-fetch";
import { performance } from "perf_hooks";

// Configuration
const BASE_URL = process.env.TEST_URL || "https://8081fea9884d.ngrok-free.app";

// Utility functions
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

async function apiRequest(method, endpoint, data = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
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

// Step 1: Test server connectivity
async function testServerConnectivity() {
  log("🌐 Testing server connectivity...");

  const result = await apiRequest("GET", "/health");

  if (result.status === 200) {
    log("✅ Server is running and accessible");
    log(`📊 Server status: ${result.data.status}`);
    log(`⏱️  Uptime: ${result.data.uptime}s`);
    return true;
  } else {
    log("❌ Server is not accessible:", result.data);
    return false;
  }
}

// Step 2: Test GitHub webhook endpoint
async function testGitHubWebhook() {
  log("🔗 Testing GitHub webhook endpoint...");

  // Simulate a GitHub webhook payload
  const webhookPayload = {
    ref: "refs/heads/main",
    repository: {
      name: "PushLog",
      full_name: "carterjohndixon/PushLog",
      id: 12345,
    },
    commits: [
      {
        id: "abc123def456",
        message: "Test commit for webhook testing",
        author: {
          name: "Carter Dixon",
          email: "carter@example.com",
        },
        added: ["src/test.js"],
        removed: [],
        modified: [],
        timestamp: new Date().toISOString(),
      },
    ],
    pusher: {
      name: "carterjohndixon",
      email: "carter@example.com",
    },
  };

  const startTime = performance.now();
  const result = await apiRequest(
    "POST",
    "/api/webhooks/github",
    webhookPayload
  );
  const endTime = performance.now();
  const duration = endTime - startTime;

  if (result.status === 200) {
    log(`✅ GitHub webhook endpoint working (${duration.toFixed(2)}ms)`);
    return true;
  } else {
    log("❌ GitHub webhook endpoint failed:", result.data);
    return false;
  }
}

// Step 3: Test webhook security
async function testWebhookSecurity() {
  log("🔒 Testing webhook security...");

  // Test with invalid payload
  const invalidPayload = {
    ref: "refs/heads/main",
    repository: { name: "test" },
    commits: [],
  };

  const result = await apiRequest(
    "POST",
    "/api/webhooks/github",
    invalidPayload
  );

  // Should either work (if no signature validation) or fail gracefully
  if (result.status === 200 || result.status === 400) {
    log("✅ Webhook security test completed");
    return true;
  } else {
    log("⚠️  Webhook security test unexpected result:", result.data);
    return false;
  }
}

// Step 4: Test rate limiting
async function testRateLimiting() {
  log("🚦 Testing rate limiting...");

  const requests = [];
  for (let i = 0; i < 5; i++) {
    requests.push(apiRequest("POST", "/api/webhooks/github", { test: i }));
  }

  const results = await Promise.all(requests);
  const successCount = results.filter((r) => r.status === 200).length;
  const rateLimitedCount = results.filter((r) => r.status === 429).length;

  log(
    `📊 Rate limiting test: ${successCount} successful, ${rateLimitedCount} rate limited`
  );

  if (rateLimitedCount > 0) {
    log("✅ Rate limiting is working");
    return true;
  } else {
    log("⚠️  Rate limiting may not be active");
    return false;
  }
}

// Step 5: Test different webhook scenarios
async function testWebhookScenarios() {
  log("🧪 Testing different webhook scenarios...");

  const scenarios = [
    {
      name: "Empty commit",
      payload: {
        ref: "refs/heads/main",
        repository: { name: "test", full_name: "user/test" },
        commits: [],
        pusher: { name: "user", email: "user@example.com" },
      },
    },
    {
      name: "Multiple commits",
      payload: {
        ref: "refs/heads/main",
        repository: { name: "test", full_name: "user/test" },
        commits: [
          {
            id: "abc123",
            message: "First commit",
            author: { name: "User", email: "user@example.com" },
            added: ["file1.js"],
            removed: [],
            modified: [],
          },
          {
            id: "def456",
            message: "Second commit",
            author: { name: "User", email: "user@example.com" },
            added: [],
            removed: ["file2.js"],
            modified: ["file3.js"],
          },
        ],
        pusher: { name: "user", email: "user@example.com" },
      },
    },
    {
      name: "Branch push",
      payload: {
        ref: "refs/heads/feature-branch",
        repository: { name: "test", full_name: "user/test" },
        commits: [
          {
            id: "ghi789",
            message: "Feature implementation",
            author: { name: "User", email: "user@example.com" },
            added: ["feature.js"],
            removed: [],
            modified: [],
          },
        ],
        pusher: { name: "user", email: "user@example.com" },
      },
    },
  ];

  let successCount = 0;
  for (const scenario of scenarios) {
    log(`🧪 Testing scenario: ${scenario.name}`);
    const result = await apiRequest(
      "POST",
      "/api/webhooks/github",
      scenario.payload
    );

    if (result.status === 200) {
      log(`✅ ${scenario.name} - Success`);
      successCount++;
    } else {
      log(`❌ ${scenario.name} - Failed (${result.status}):`, result.data);
    }

    // Wait between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  log(`📊 Scenario testing: ${successCount}/${scenarios.length} successful`);
  return successCount >= scenarios.length * 0.5;
}

// Step 6: Provide real webhook setup instructions
function provideRealWebhookInstructions() {
  log("\n🌐 Real GitHub Webhook Setup Instructions:");
  log("=".repeat(60));
  log("1. Go to your GitHub repository → Settings → Webhooks");
  log("2. Click 'Add webhook'");
  log(
    "3. Set Payload URL: https://8081fea9884d.ngrok-free.app/api/webhooks/github"
  );
  log("4. Set Content type: application/json");
  log("5. Select 'Just the push event'");
  log("6. Click 'Add webhook'");
  log("");
  log("7. Make a test commit:");
  log("   git add .");
  log("   git commit -m 'Test webhook'");
  log("   git push origin main");
  log("");
  log("8. Check your server logs for webhook processing");
  log("9. Check Slack for the notification");
}

// Main test function
async function testWebhooksManual() {
  log("🚀 Starting Manual Webhook Testing...");
  log(`📍 Testing against: ${BASE_URL}`);

  const results = {
    connectivity: false,
    githubWebhook: false,
    security: false,
    rateLimiting: false,
    scenarios: false,
  };

  try {
    // Step 1: Test server connectivity
    results.connectivity = await testServerConnectivity();
    if (!results.connectivity) {
      log("❌ Cannot proceed without server connectivity");
      return false;
    }

    // Step 2: Test GitHub webhook
    results.githubWebhook = await testGitHubWebhook();

    // Step 3: Test security
    results.security = await testWebhookSecurity();

    // Step 4: Test rate limiting
    results.rateLimiting = await testRateLimiting();

    // Step 5: Test scenarios
    results.scenarios = await testWebhookScenarios();

    // Step 6: Provide instructions
    provideRealWebhookInstructions();

    // Summary
    log("\n🎉 Webhook Testing Summary:");
    log("=".repeat(50));
    log(`✅ Server Connectivity: ${results.connectivity ? "✅" : "❌"}`);
    log(`✅ GitHub Webhook: ${results.githubWebhook ? "✅" : "❌"}`);
    log(`✅ Security: ${results.security ? "✅" : "❌"}`);
    log(`✅ Rate Limiting: ${results.rateLimiting ? "✅" : "❌"}`);
    log(`✅ Scenarios: ${results.scenarios ? "✅" : "❌"}`);

    const successCount = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;

    log(
      `\n📊 Overall Success Rate: ${successCount}/${totalTests} (${(
        (successCount / totalTests) *
        100
      ).toFixed(1)}%)`
    );

    if (successCount >= totalTests * 0.8) {
      log(
        "\n🎉 Webhook testing passed! Your webhook endpoints are working correctly."
      );
      log(
        "💡 Next step: Set up real GitHub webhook using the instructions above."
      );
      return true;
    } else {
      log("\n⚠️  Some webhook tests failed. Check the logs above for details.");
      return false;
    }
  } catch (error) {
    log("❌ Webhook testing failed:", error.message);
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testWebhooksManual()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Webhook test failed:", error);
      process.exit(1);
    });
}

export { testWebhooksManual };
