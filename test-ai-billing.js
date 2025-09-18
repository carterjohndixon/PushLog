// AI and Billing Test Script
// Run with: node test-ai-billing.js YOUR_JWT_TOKEN_HERE

// TEST CARD NUMBERS
// Successful payment: 4242424242424242
// Card declined: 4000000000000002

const BASE_URL = "https://8081fea9884d.ngrok-free.app"; // Your ngrok URL

// Get JWT token from command line arguments
const token = process.argv[2];

if (!token) {
  console.log("❌ Error: JWT token is required!");
  console.log("Usage: node test-ai-billing.js YOUR_JWT_TOKEN_HERE");
  console.log(
    "Get your token from: localStorage.getItem('token') in browser console"
  );
  process.exit(1);
}

console.log("🔑 Using token:", token.substring(0, 20) + "...");

// Test AI model switching
const testAiModel = async () => {
  try {
    console.log("🧪 Testing AI Model switching...");

    const response = await fetch(`${BASE_URL}/api/integrations/14`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        aiModel: "gpt-4",
        maxTokens: 1000,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("✅ AI Model updated successfully:", result);
    } else {
      console.log(
        "❌ AI Model update failed:",
        response.status,
        await response.text()
      );
    }
  } catch (error) {
    console.log("❌ Error testing AI model:", error.message);
  }
};

// Test credit purchase
const testCreditPurchase = async () => {
  try {
    console.log("🧪 Testing Credit Purchase...");

    const response = await fetch(
      `${BASE_URL}/api/payments/create-payment-intent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageId: "starter",
        }),
      }
    );

    if (response.ok) {
      const result = await response.json();
      console.log("✅ Payment intent created successfully:", result);
    } else {
      console.log(
        "❌ Payment intent creation failed:",
        response.status,
        await response.text()
      );
    }
  } catch (error) {
    console.log("❌ Error testing credit purchase:", error.message);
  }
};

// Test AI usage (simulate a commit)
const testAiUsage = async () => {
  try {
    console.log("🧪 Testing AI Usage...");

    const response = await fetch(`${BASE_URL}/api/test-ai-summary/1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const result = await response.json();
      console.log("✅ AI summary generated successfully:", result);
    } else {
      console.log(
        "❌ AI summary generation failed:",
        response.status,
        await response.text()
      );
    }
  } catch (error) {
    console.log("❌ Error testing AI usage:", error.message);
  }
};

// Main test runner
const runTests = async () => {
  console.log("🚀 Starting AI and Billing Tests...\n");

  await testAiModel();
  console.log("");

  await testCreditPurchase();
  console.log("");

  await testAiUsage();
  console.log("");

  console.log("🏁 Tests completed!");
};

// Run the tests
runTests();
