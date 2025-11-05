// Quick API endpoint test script
const baseUrl = "https://8081fea9884d.ngrok-free.app";

async function testEndpoint(endpoint, method = "GET", body = null) {
  try {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${baseUrl}${endpoint}`, options);
    const data = await response.json();

    console.log(`✅ ${method} ${endpoint}: ${response.status}`);
    return { status: response.status, data };
  } catch (error) {
    console.log(`❌ ${method} ${endpoint}: ${error.message}`);
    return { error: error.message };
  }
}

async function runTests() {
  console.log("🧪 Testing PushLog API Endpoints...\n");

  // Test public endpoints
  await testEndpoint("/health");
  await testEndpoint("/health/detailed");

  // Test auth endpoints (these will fail without proper data, but should return expected errors)
  await testEndpoint("/api/login", "POST", {
    identifier: "CarterJohn",
    password: "HelloWorld1!",
  });
  await testEndpoint("/api/signup", "POST", {
    username: "test",
    email: "test@test.com",
    password: "test123",
  });

  console.log("\n✅ Basic endpoint tests completed!");
  console.log("\n📝 Next steps:");
  console.log("1. Test authentication flows manually");
  console.log("2. Test GitHub/Slack connections");
  console.log("3. Test integration creation");
  console.log("4. Test webhook processing");
}

runTests();
