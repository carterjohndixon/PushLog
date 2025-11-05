#!/usr/bin/env node

/**
 * PushLog Payment Flow Testing Suite
 * Tests Stripe integration, payment processing, and credit system
 */

import fetch from "node-fetch";
import { performance } from "perf_hooks";

// Configuration
const BASE_URL = process.env.TEST_URL || "https://8081fea9884d.ngrok-free.app";

// Test data
const testUser = {
  username: `paymenttest_${Date.now()}`,
  email: `paymenttest_${Date.now()}@example.com`,
  password: "TestPassword123!",
};

// Stripe test cards
const TEST_CARDS = {
  success: {
    number: "4242424242424242",
    expiryMonth: "12",
    expiryYear: "2025",
    cvc: "123",
  },
  declined: {
    number: "4000000000000002",
    expiryMonth: "12",
    expiryYear: "2025",
    cvc: "123",
  },
  insufficient_funds: {
    number: "4000000000009995",
    expiryMonth: "12",
    expiryYear: "2025",
    cvc: "123",
  },
  expired: {
    number: "4000000000000069",
    expiryMonth: "12",
    expiryYear: "2020",
    cvc: "123",
  },
};

// Credit packages
const CREDIT_PACKAGES = [
  { id: "starter", name: "Starter", credits: 1000, price: 5 },
  { id: "professional", name: "Professional", credits: 5000, price: 20 },
  { id: "enterprise", name: "Enterprise", credits: 15000, price: 50 },
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
  log("👤 Setting up test user...");

  // Signup
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

async function testPaymentIntentCreation() {
  log("💳 Testing payment intent creation...");

  const { result, duration } = await measureTime(apiRequest)(
    "POST",
    "/api/payments/create-payment-intent",
    { packageId: "starter" },
    authToken
  );

  log(`✅ Payment intent created in ${duration.toFixed(2)}ms`, {
    status: result.status,
    success: result.status === 200,
    hasClientSecret: !!result.data.clientSecret,
  });

  return { success: result.status === 200, duration, data: result.data };
}

async function testSuccessfulPayment() {
  log("✅ Testing successful payment processing...");

  const { result, duration } = await measureTime(apiRequest)(
    "POST",
    "/api/payments/process-test-payment",
    {
      paymentIntentId: "test_pi_success",
      packageId: "starter",
      cardDetails: TEST_CARDS.success,
    },
    authToken
  );

  log(`✅ Payment processed in ${duration.toFixed(2)}ms`, {
    status: result.status,
    success: result.status === 200,
    creditsAdded: result.data?.creditsAdded,
    newBalance: result.data?.newBalance,
  });

  return { success: result.status === 200, duration, data: result.data };
}

async function testDeclinedPayment() {
  log("❌ Testing declined payment...");

  const { result, duration } = await measureTime(apiRequest)(
    "POST",
    "/api/payments/process-test-payment",
    {
      paymentIntentId: "test_pi_declined",
      packageId: "starter",
      cardDetails: TEST_CARDS.declined,
    },
    authToken
  );

  log(`❌ Declined payment handled in ${duration.toFixed(2)}ms`, {
    status: result.status,
    expectedFailure: result.status !== 200,
    errorMessage: result.data?.error,
  });

  return { success: result.status !== 200, duration, data: result.data };
}

async function testInvalidCard() {
  log("🚫 Testing invalid card number...");

  const { result, duration } = await measureTime(apiRequest)(
    "POST",
    "/api/payments/process-test-payment",
    {
      paymentIntentId: "test_pi_invalid",
      packageId: "starter",
      cardDetails: {
        number: "1234567890123456", // Invalid card
        expiryMonth: "12",
        expiryYear: "2025",
        cvc: "123",
      },
    },
    authToken
  );

  log(`🚫 Invalid card handled in ${duration.toFixed(2)}ms`, {
    status: result.status,
    expectedFailure: result.status !== 200,
    errorMessage: result.data?.error,
  });

  return { success: result.status !== 200, duration, data: result.data };
}

async function testCreditDeduction() {
  log("💰 Testing AI credit deduction...");

  // First, get current credit balance
  const profileResult = await apiRequest(
    "GET",
    "/api/profile",
    null,
    authToken
  );
  const initialCredits = profileResult.data?.user?.aiCredits || 0;

  log(`📊 Initial credits: ${initialCredits}`);

  // Test AI summary generation (this should deduct credits)
  const { result, duration } = await measureTime(apiRequest)(
    "POST",
    "/api/test-ai-summary/1",
    {},
    authToken
  );

  // Check credits after AI usage
  const profileResultAfter = await apiRequest(
    "GET",
    "/api/profile",
    null,
    authToken
  );
  const finalCredits = profileResultAfter.data?.user?.aiCredits || 0;
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

async function testCreditPackages() {
  log("📦 Testing all credit packages...");

  const results = [];

  for (const pkg of CREDIT_PACKAGES) {
    log(
      `🧪 Testing package: ${pkg.name} (${pkg.credits} credits, $${pkg.price})`
    );

    const { result, duration } = await measureTime(apiRequest)(
      "POST",
      "/api/payments/create-payment-intent",
      { packageId: pkg.id },
      authToken
    );

    const success = result.status === 200;
    results.push({
      package: pkg,
      success,
      duration,
      hasClientSecret: !!result.data?.clientSecret,
    });

    log(`   ${success ? "✅" : "❌"} ${pkg.name}: ${duration.toFixed(2)}ms`);
  }

  return results;
}

async function testPaymentSecurity() {
  log("🔒 Testing payment security...");

  const securityTests = [
    {
      name: "Unauthenticated payment attempt",
      test: () =>
        apiRequest("POST", "/api/payments/create-payment-intent", {
          packageId: "starter",
        }),
    },
    {
      name: "Invalid package ID",
      test: () =>
        apiRequest(
          "POST",
          "/api/payments/create-payment-intent",
          { packageId: "invalid" },
          authToken
        ),
    },
    {
      name: "Missing package ID",
      test: () =>
        apiRequest(
          "POST",
          "/api/payments/create-payment-intent",
          {},
          authToken
        ),
    },
  ];

  const results = [];

  for (const test of securityTests) {
    const { result, duration } = await measureTime(test.test);
    const expectedFailure = result.status !== 200;

    results.push({
      name: test.name,
      success: expectedFailure,
      duration,
      status: result.status,
    });

    log(
      `🔒 ${test.name}: ${expectedFailure ? "✅" : "❌"} (${duration.toFixed(
        2
      )}ms)`
    );
  }

  return results;
}

async function testWebhookSimulation() {
  log("🔗 Testing webhook simulation...");

  // Simulate a successful payment webhook
  const webhookPayload = {
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "test_pi_webhook",
        customer: "test_customer",
        amount: 500, // $5.00
        metadata: {
          packageId: "starter",
          credits: "1000",
        },
      },
    },
  };

  const { result, duration } = await measureTime(apiRequest)(
    "POST",
    "/api/payments/webhook",
    webhookPayload
  );

  log(`🔗 Webhook simulation completed in ${duration.toFixed(2)}ms`, {
    status: result.status,
    success: result.status === 200,
  });

  return { success: result.status === 200, duration, data: result.data };
}

// Main test runner
async function runPaymentTests() {
  log("🚀 Starting PushLog Payment Flow Tests...");
  log(`📍 Testing against: ${BASE_URL}`);

  const results = {
    userSetup: null,
    paymentIntent: null,
    successfulPayment: null,
    declinedPayment: null,
    invalidCard: null,
    creditDeduction: null,
    creditPackages: null,
    security: null,
    webhook: null,
  };

  try {
    // Setup
    results.userSetup = await setupTestUser();
    if (!results.userSetup) {
      log("❌ User setup failed, skipping payment tests");
      return results;
    }

    // Payment flow tests
    results.paymentIntent = await testPaymentIntentCreation();
    results.successfulPayment = await testSuccessfulPayment();
    results.declinedPayment = await testDeclinedPayment();
    results.invalidCard = await testInvalidCard();
    results.creditDeduction = await testCreditDeduction();
    results.creditPackages = await testCreditPackages();
    results.security = await testPaymentSecurity();
    results.webhook = await testWebhookSimulation();

    // Payment analysis
    log("\n💳 PAYMENT FLOW ANALYSIS:");
    log("=".repeat(50));

    const paymentTests = [
      { name: "Payment Intent Creation", result: results.paymentIntent },
      { name: "Successful Payment", result: results.successfulPayment },
      { name: "Declined Payment", result: results.declinedPayment },
      { name: "Invalid Card", result: results.invalidCard },
      { name: "Credit Deduction", result: results.creditDeduction },
      { name: "Webhook Processing", result: results.webhook },
    ];

    paymentTests.forEach((test) => {
      if (test.result) {
        const status = test.result.success ? "✅" : "❌";
        log(`${status} ${test.name}: ${test.result.duration.toFixed(2)}ms`);
      }
    });

    // Credit package analysis
    if (results.creditPackages) {
      log("\n📦 CREDIT PACKAGES:");
      results.creditPackages.forEach((pkg) => {
        const status = pkg.success ? "✅" : "❌";
        log(`${status} ${pkg.package.name}: ${pkg.duration.toFixed(2)}ms`);
      });
    }

    // Security analysis
    if (results.security) {
      log("\n🔒 SECURITY TESTS:");
      results.security.forEach((test) => {
        const status = test.success ? "✅" : "❌";
        log(`${status} ${test.name}: ${test.duration.toFixed(2)}ms`);
      });
    }

    // Payment recommendations
    log("\n💡 PAYMENT RECOMMENDATIONS:");
    log("=".repeat(50));

    const failedTests = paymentTests.filter(
      (test) => test.result && !test.result.success
    );

    if (failedTests.length > 0) {
      log("⚠️  Failed payment tests:");
      failedTests.forEach((test) => {
        log(`   - ${test.name}`);
      });
    } else {
      log("✅ All payment tests passed!");
    }

    if (
      results.creditDeduction &&
      results.creditDeduction.creditsDeducted > 0
    ) {
      log("✅ Credit deduction system working correctly");
    } else {
      log("⚠️  Credit deduction may not be working properly");
    }

    log("\n🎉 Payment flow testing completed!");
  } catch (error) {
    log("❌ Payment test failed:", error.message);
  }

  return results;
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPaymentTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Payment test runner failed:", error);
      process.exit(1);
    });
}

export { runPaymentTests };
