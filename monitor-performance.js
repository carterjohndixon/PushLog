#!/usr/bin/env node

/**
 * PushLog Performance Monitor
 * Continuous monitoring of API endpoints and database performance
 */

import fetch from "node-fetch";
import { performance } from "perf_hooks";

// Configuration
const BASE_URL = process.env.TEST_URL || "https://8081fea9884d.ngrok-free.app";
const MONITOR_INTERVAL = 30000; // 30 seconds
const ALERT_THRESHOLD = 2000; // 2 seconds

// Performance metrics storage
const metrics = {
  endpoints: new Map(),
  alerts: [],
  startTime: Date.now(),
};

// Utility functions
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}

function getAverageResponseTime(endpoint) {
  const endpointMetrics = metrics.endpoints.get(endpoint);
  if (!endpointMetrics || endpointMetrics.responses.length === 0) {
    return 0;
  }

  const total = endpointMetrics.responses.reduce((sum, time) => sum + time, 0);
  return total / endpointMetrics.responses.length;
}

function getSuccessRate(endpoint) {
  const endpointMetrics = metrics.endpoints.get(endpoint);
  if (!endpointMetrics || endpointMetrics.total === 0) {
    return 100;
  }

  return (endpointMetrics.successful / endpointMetrics.total) * 100;
}

// Monitoring functions
async function monitorEndpoint(
  endpoint,
  method = "GET",
  data = null,
  token = null
) {
  const start = performance.now();

  try {
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
    const end = performance.now();
    const duration = end - start;

    const isSuccess = response.status >= 200 && response.status < 300;

    // Update metrics
    if (!metrics.endpoints.has(endpoint)) {
      metrics.endpoints.set(endpoint, {
        responses: [],
        total: 0,
        successful: 0,
        failed: 0,
        lastCheck: null,
      });
    }

    const endpointMetrics = metrics.endpoints.get(endpoint);
    endpointMetrics.responses.push(duration);
    endpointMetrics.total++;
    endpointMetrics.lastCheck = new Date();

    if (isSuccess) {
      endpointMetrics.successful++;
    } else {
      endpointMetrics.failed++;
    }

    // Keep only last 100 responses for rolling average
    if (endpointMetrics.responses.length > 100) {
      endpointMetrics.responses.shift();
    }

    // Check for performance alerts
    if (duration > ALERT_THRESHOLD) {
      const alert = {
        timestamp: new Date(),
        endpoint,
        duration,
        status: response.status,
        message: `Slow response detected: ${duration.toFixed(2)}ms`,
      };

      metrics.alerts.push(alert);
      log(`⚠️  PERFORMANCE ALERT: ${alert.message}`, alert);
    }

    return {
      success: isSuccess,
      duration,
      status: response.status,
    };
  } catch (error) {
    const end = performance.now();
    const duration = end - start;

    // Update metrics for failed requests
    if (!metrics.endpoints.has(endpoint)) {
      metrics.endpoints.set(endpoint, {
        responses: [],
        total: 0,
        successful: 0,
        failed: 0,
        lastCheck: null,
      });
    }

    const endpointMetrics = metrics.endpoints.get(endpoint);
    endpointMetrics.responses.push(duration);
    endpointMetrics.total++;
    endpointMetrics.failed++;
    endpointMetrics.lastCheck = new Date();

    const alert = {
      timestamp: new Date(),
      endpoint,
      duration,
      status: "ERROR",
      message: `Request failed: ${error.message}`,
    };

    metrics.alerts.push(alert);
    log(`❌ ERROR ALERT: ${alert.message}`, alert);

    return {
      success: false,
      duration,
      status: "ERROR",
      error: error.message,
    };
  }
}

async function runHealthChecks() {
  log("🏥 Running health checks...");

  const healthEndpoints = ["/health", "/health/detailed"];

  for (const endpoint of healthEndpoints) {
    await monitorEndpoint(endpoint);
  }
}

async function runPerformanceChecks() {
  log("⚡ Running performance checks...");

  // Note: These will fail without authentication, but we can still measure response times
  const performanceEndpoints = [
    "/api/profile",
    "/api/integrations",
    "/api/notifications/unread",
    "/api/stats",
  ];

  for (const endpoint of performanceEndpoints) {
    await monitorEndpoint(endpoint);
  }
}

function generateReport() {
  log("\n📊 PERFORMANCE REPORT:");
  log("=".repeat(60));

  const uptime = Date.now() - metrics.startTime;
  const uptimeMinutes = Math.floor(uptime / 60000);

  log(`⏱️  Monitoring Duration: ${uptimeMinutes} minutes`);
  log(`📈 Total Alerts: ${metrics.alerts.length}`);

  if (metrics.endpoints.size > 0) {
    log("\n📋 Endpoint Performance:");
    log("-".repeat(40));

    for (const [endpoint, data] of metrics.endpoints) {
      const avgResponseTime = getAverageResponseTime(endpoint);
      const successRate = getSuccessRate(endpoint);
      const lastCheck = data.lastCheck ? data.lastCheck.toISOString() : "Never";

      log(`${endpoint}:`);
      log(`  📊 Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
      log(`  ✅ Success Rate: ${successRate.toFixed(1)}%`);
      log(`  📈 Total Requests: ${data.total}`);
      log(`  🕐 Last Check: ${lastCheck}`);
      log("");
    }
  }

  if (metrics.alerts.length > 0) {
    log("\n⚠️  Recent Alerts:");
    log("-".repeat(40));

    const recentAlerts = metrics.alerts.slice(-10); // Last 10 alerts
    recentAlerts.forEach((alert) => {
      log(`${alert.timestamp.toISOString()}: ${alert.message}`);
    });
  }

  // Performance recommendations
  log("\n💡 Performance Insights:");
  log("-".repeat(40));

  const slowEndpoints = [];
  const failingEndpoints = [];

  for (const [endpoint, data] of metrics.endpoints) {
    const avgResponseTime = getAverageResponseTime(endpoint);
    const successRate = getSuccessRate(endpoint);

    if (avgResponseTime > 1000) {
      slowEndpoints.push({ endpoint, avgResponseTime });
    }

    if (successRate < 95) {
      failingEndpoints.push({ endpoint, successRate });
    }
  }

  if (slowEndpoints.length > 0) {
    log("🐌 Slow endpoints detected:");
    slowEndpoints.forEach((ep) => {
      log(`   - ${ep.endpoint}: ${ep.avgResponseTime.toFixed(2)}ms`);
    });
  }

  if (failingEndpoints.length > 0) {
    log("❌ Endpoints with low success rates:");
    failingEndpoints.forEach((ep) => {
      log(`   - ${ep.endpoint}: ${ep.successRate.toFixed(1)}%`);
    });
  }

  if (slowEndpoints.length === 0 && failingEndpoints.length === 0) {
    log("✅ All endpoints performing well!");
  }
}

// Main monitoring loop
async function startMonitoring() {
  log("🚀 Starting PushLog Performance Monitor...");
  log(`📍 Monitoring: ${BASE_URL}`);
  log(`⏱️  Interval: ${MONITOR_INTERVAL / 1000} seconds`);
  log(`⚠️  Alert Threshold: ${ALERT_THRESHOLD}ms`);
  log("");

  let cycleCount = 0;

  const monitoringLoop = async () => {
    cycleCount++;
    log(`🔄 Monitoring Cycle #${cycleCount}`);

    try {
      await runHealthChecks();
      await runPerformanceChecks();

      // Generate report every 10 cycles (5 minutes)
      if (cycleCount % 10 === 0) {
        generateReport();
      }
    } catch (error) {
      log("❌ Monitoring cycle failed:", error.message);
    }

    // Schedule next cycle
    setTimeout(monitoringLoop, MONITOR_INTERVAL);
  };

  // Start the monitoring loop
  monitoringLoop();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    log("\n🛑 Shutting down performance monitor...");
    generateReport();
    process.exit(0);
  });
}

// Run monitoring if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startMonitoring();
}

export { startMonitoring, generateReport };
