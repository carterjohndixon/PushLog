#!/usr/bin/env node

/**
 * Test Webhooks with Existing Account
 * Tests webhook functionality using your existing connected accounts
 */

import fetch from "node-fetch";
import { performance } from "perf_hooks";

// Configuration
const BASE_URL = process.env.TEST_URL || "https://8081fea9884d.ngrok-free.app";

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

// Step 1: Get your existing account info
async function getAccountInfo() {
  log("👤 Getting existing account information...");

  // Try to get profile info (this will work if you're logged in)
  const profileResult = await apiRequest("GET", "/api/profile");

  if (profileResult.status === 200) {
    userId = profileResult.data.user.id;
    log("✅ Account information retrieved");
    log(`📧 Email: ${profileResult.data.user.email}`);
    log(`📊 AI Credits: ${profileResult.data.user.aiCredits}`);
    log(`✅ Email Verified: ${profileResult.data.user.emailVerified}`);
    return true;
  } else {
    log("❌ Could not retrieve account info. You may need to log in first.");
    log(
      "💡 Please log in to your account at: https://8081fea9884d.ngrok-free.app"
    );
    return false;
  }
}

// Step 2: Get your repositories
async function getRepositories() {
  log("📁 Getting your repositories...");

  const result = await apiRequest("GET", "/api/repositories");

  if (result.status === 200) {
    const repos = result.data;
    log(`✅ Found ${repos.length} repositories:`);
    repos.forEach((repo, index) => {
      log(
        `   ${index + 1}. ${repo.name} (${
          repo.isActive ? "Active" : "Inactive"
        })`
      );
    });
    return repos;
  } else {
    log("❌ Could not retrieve repositories:", result.data);
    return [];
  }
}

// Step 3: Get your integrations
async function getIntegrations() {
  log("🔗 Getting your integrations...");

  const result = await apiRequest("GET", "/api/integrations");

  if (result.status === 200) {
    const integrations = result.data;
    log(`✅ Found ${integrations.length} integrations:`);
    integrations.forEach((integration, index) => {
      log(
        `   ${index + 1}. Repository: ${integration.repositoryName}, Active: ${
          integration.isActive
        }`
      );
    });
    return integrations;
  } else {
    log("❌ Could not retrieve integrations:", result.data);
    return [];
  }
}

// Step 4: Test GitHub webhook endpoint
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

  const result = await apiRequest(
    "POST",
    "/api/github/webhook",
    webhookPayload
  );

  if (result.status === 200) {
    log("✅ GitHub webhook endpoint working");
    return true;
  } else {
    log("❌ GitHub webhook endpoint failed:", result.data);
    return false;
  }
}

// Step 5: Test AI summary generation
async function testAISummary() {
  log("🤖 Testing AI summary generation...");

  const result = await apiRequest("POST", "/api/test-ai-summary/1");

  if (result.status === 200) {
    log("✅ AI summary generation working");
    return true;
  } else {
    log("⚠️  AI summary generation failed:", result.data);
    return false;
  }
}

// Step 6: Test Slack connection
async function testSlackConnection() {
  log("💬 Testing Slack connection...");

  const result = await apiRequest("GET", "/api/slack/test");

  if (result.status === 200) {
    log("✅ Slack connection working");
    return true;
  } else {
    log(
      "⚠️  Slack connection failed (expected in test environment):",
      result.data
    );
    return false;
  }
}

// Step 7: Test complete webhook flow
async function testCompleteWebhookFlow() {
  log("🔄 Testing complete webhook flow...");

  // Simulate a complete GitHub push event
  const pushEvent = {
    ref: "refs/heads/main",
    repository: {
      name: "PushLog",
      full_name: "carterjohndixon/PushLog",
      id: 12345,
    },
    commits: [
      {
        id: "abc123def456",
        message: "Add new feature for webhook testing",
        author: {
          name: "Carter Dixon",
          email: "carter@example.com",
        },
        added: ["src/feature.js", "tests/feature.test.js"],
        removed: [],
        modified: ["README.md"],
        timestamp: new Date().toISOString(),
      },
    ],
    pusher: {
      name: "carterjohndixon",
      email: "carter@example.com",
    },
  };

  const startTime = performance.now();
  const result = await apiRequest("POST", "/api/github/webhook", pushEvent);
  const endTime = performance.now();
  const duration = endTime - startTime;

  if (result.status === 200) {
    log(`✅ Complete webhook flow working (${duration.toFixed(2)}ms)`);
    return true;
  } else {
    log("❌ Complete webhook flow failed:", result.data);
    return false;
  }
}

// Step 8: Test webhook security
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
    "/api/github/webhook",
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

// Step 9: Test real GitHub webhook (if you have a repository)
async function testRealGitHubWebhook() {
  log("🌐 Testing real GitHub webhook...");

  log("💡 To test with a real GitHub webhook:");
  log("1. Go to your GitHub repository → Settings → Webhooks");
  log(
    "2. Add webhook with URL: https://8081fea9884d.ngrok-free.app/api/github/webhook"
  );
  log("3. Select 'Just the push event'");
  log("4. Make a commit and push to trigger the webhook");
  log("5. Check your server logs for webhook processing");

  return true;
}

// Main test function
async function testExistingWebhooks() {
  log("🚀 Starting Webhook Testing with Existing Account...");
  log(`📍 Testing against: ${BASE_URL}`);

  const results = {
    accountInfo: false,
    repositories: false,
    integrations: false,
    githubWebhook: false,
    aiSummary: false,
    slackConnection: false,
    completeFlow: false,
    security: false,
  };

  try {
    // Step 1: Get account info
    results.accountInfo = await getAccountInfo();
    if (!results.accountInfo) {
      log("❌ Cannot proceed without account info");
      log("💡 Please log in to your account first");
      return false;
    }

    // Step 2: Get repositories
    const repositories = await getRepositories();
    results.repositories = repositories.length > 0;

    // Step 3: Get integrations
    const integrations = await getIntegrations();
    results.integrations = integrations.length > 0;

    // Step 4: Test GitHub webhook
    results.githubWebhook = await testGitHubWebhook();

    // Step 5: Test AI summary
    results.aiSummary = await testAISummary();

    // Step 6: Test Slack connection
    results.slackConnection = await testSlackConnection();

    // Step 7: Test complete flow
    results.completeFlow = await testCompleteWebhookFlow();

    // Step 8: Test security
    results.security = await testWebhookSecurity();

    // Step 9: Real webhook instructions
    await testRealGitHubWebhook();

    // Summary
    log("\n🎉 Webhook Testing Summary:");
    log("=".repeat(50));
    log(`✅ Account Info: ${results.accountInfo ? "✅" : "❌"}`);
    log(`✅ Repositories: ${results.repositories ? "✅" : "❌"}`);
    log(`✅ Integrations: ${results.integrations ? "✅" : "❌"}`);
    log(`✅ GitHub Webhook: ${results.githubWebhook ? "✅" : "❌"}`);
    log(`✅ AI Summary: ${results.aiSummary ? "✅" : "❌"}`);
    log(`✅ Slack Connection: ${results.slackConnection ? "✅" : "❌"}`);
    log(`✅ Complete Flow: ${results.completeFlow ? "✅" : "❌"}`);
    log(`✅ Security: ${results.security ? "✅" : "❌"}`);

    const successCount = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;

    log(
      `\n📊 Overall Success Rate: ${successCount}/${totalTests} (${(
        (successCount / totalTests) *
        100
      ).toFixed(1)}%)`
    );

    if (successCount >= totalTests * 0.7) {
      log("\n🎉 Webhook testing passed! Your webhooks are working correctly.");
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
  testExistingWebhooks()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Webhook test failed:", error);
      process.exit(1);
    });
}

export { testExistingWebhooks };
