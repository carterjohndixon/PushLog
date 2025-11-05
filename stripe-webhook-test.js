#!/usr/bin/env node

/**
 * Stripe Webhook Testing Tool
 * Tests webhook processing and payment confirmation
 */

import fetch from "node-fetch";
import crypto from "crypto";

// Configuration
const BASE_URL = process.env.TEST_URL || "https://8081fea9884d.ngrok-free.app";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_secret";

// Utility functions
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

function generateStripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

// Test webhook events
const WEBHOOK_EVENTS = {
  payment_intent_succeeded: {
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_success_123",
        customer: "cus_test_customer",
        amount: 500, // $5.00
        currency: "usd",
        status: "succeeded",
        metadata: {
          packageId: "starter",
          credits: "1000",
        },
      },
    },
  },
  payment_intent_payment_failed: {
    type: "payment_intent.payment_failed",
    data: {
      object: {
        id: "pi_test_failed_123",
        customer: "cus_test_customer",
        amount: 500,
        currency: "usd",
        status: "requires_payment_method",
        last_payment_error: {
          type: "card_error",
          code: "card_declined",
          message: "Your card was declined.",
        },
      },
    },
  },
  customer_created: {
    type: "customer.created",
    data: {
      object: {
        id: "cus_test_customer",
        email: "test@example.com",
        created: Math.floor(Date.now() / 1000),
      },
    },
  },
};

async function testWebhookEvent(eventName, eventData) {
  log(`🧪 Testing webhook event: ${eventName}`);

  const payload = JSON.stringify(eventData);
  const signature = generateStripeSignature(payload, WEBHOOK_SECRET);

  try {
    const response = await fetch(`${BASE_URL}/api/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": signature,
      },
      body: payload,
    });

    const responseData = await response.json();

    log(`✅ Webhook processed: ${response.status}`, {
      status: response.status,
      success: response.status === 200,
      response: responseData,
    });

    return {
      success: response.status === 200,
      status: response.status,
      data: responseData,
    };
  } catch (error) {
    log(`❌ Webhook failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testWebhookSecurity() {
  log("🔒 Testing webhook security...");

  const securityTests = [
    {
      name: "Invalid signature",
      test: async () => {
        const payload = JSON.stringify(WEBHOOK_EVENTS.payment_intent_succeeded);
        const response = await fetch(`${BASE_URL}/api/payments/webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": "invalid_signature",
          },
          body: payload,
        });
        return response;
      },
    },
    {
      name: "Missing signature",
      test: async () => {
        const payload = JSON.stringify(WEBHOOK_EVENTS.payment_intent_succeeded);
        const response = await fetch(`${BASE_URL}/api/payments/webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: payload,
        });
        return response;
      },
    },
    {
      name: "Invalid JSON payload",
      test: async () => {
        const response = await fetch(`${BASE_URL}/api/payments/webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": "t=1234567890,v1=invalid",
          },
          body: "invalid json",
        });
        return response;
      },
    },
  ];

  const results = [];

  for (const test of securityTests) {
    try {
      const response = await test.test();
      const success = response.status === 400; // Should reject invalid requests

      results.push({
        name: test.name,
        success,
        status: response.status,
      });

      log(`🔒 ${test.name}: ${success ? "✅" : "❌"} (${response.status})`);
    } catch (error) {
      log(`🔒 ${test.name}: ❌ (Error: ${error.message})`);
      results.push({
        name: test.name,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

async function runWebhookTests() {
  log("🚀 Starting Stripe Webhook Tests...");
  log(`📍 Testing against: ${BASE_URL}`);
  log(`🔑 Using webhook secret: ${WEBHOOK_SECRET.substring(0, 10)}...`);

  const results = {
    events: {},
    security: null,
  };

  try {
    // Test webhook events
    for (const [eventName, eventData] of Object.entries(WEBHOOK_EVENTS)) {
      results.events[eventName] = await testWebhookEvent(eventName, eventData);

      // Wait 1 second between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Test webhook security
    results.security = await testWebhookSecurity();

    // Analysis
    log("\n📊 WEBHOOK TEST ANALYSIS:");
    log("=".repeat(50));

    log("📨 Event Processing:");
    for (const [eventName, result] of Object.entries(results.events)) {
      const status = result.success ? "✅" : "❌";
      log(`   ${status} ${eventName}: ${result.status || "ERROR"}`);
    }

    if (results.security) {
      log("\n🔒 Security Tests:");
      results.security.forEach((test) => {
        const status = test.success ? "✅" : "❌";
        log(`   ${status} ${test.name}: ${test.status || "ERROR"}`);
      });
    }

    // Recommendations
    log("\n💡 WEBHOOK RECOMMENDATIONS:");
    log("=".repeat(50));

    const failedEvents = Object.entries(results.events).filter(
      ([, result]) => !result.success
    );

    if (failedEvents.length > 0) {
      log("⚠️  Failed webhook events:");
      failedEvents.forEach(([eventName]) => {
        log(`   - ${eventName}`);
      });
    } else {
      log("✅ All webhook events processed successfully");
    }

    const failedSecurity =
      results.security?.filter((test) => !test.success) || [];
    if (failedSecurity.length > 0) {
      log("⚠️  Security issues detected:");
      failedSecurity.forEach((test) => {
        log(`   - ${test.name}`);
      });
    } else {
      log("✅ Webhook security working correctly");
    }

    log("\n🎉 Webhook testing completed!");
  } catch (error) {
    log("❌ Webhook test failed:", error.message);
  }

  return results;
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runWebhookTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Webhook test runner failed:", error);
      process.exit(1);
    });
}

export { runWebhookTests };
