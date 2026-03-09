/**
 * Measure endpoint response times for Settings page loads.
 * Run: npx tsx scripts/test-endpoint-timing.ts [BASE_URL] [COOKIE]
 *
 * Get your session cookie: DevTools → Application → Cookies → connect.sid
 *
 * Example:
 *   LOG_PERF=1 npx tsx scripts/test-endpoint-timing.ts http://localhost:5001 "connect.sid=s%3A..."
 */

const BASE_URL = process.argv[2] || "http://localhost:5001";
const COOKIE = process.argv[3] || process.env.TEST_COOKIE;

if (!COOKIE) {
  console.error("Usage: npx tsx scripts/test-endpoint-timing.ts BASE_URL COOKIE");
  console.error("Or set TEST_COOKIE env var.");
  console.error("\nGet cookie: DevTools → Application → Cookies → connect.sid");
  process.exit(1);
}

const endpoints = [
  { name: "/api/profile", path: "/api/profile" },
  { name: "/api/org", path: "/api/org" },
  { name: "/api/account/data-summary", path: "/api/account/data-summary" },
  { name: "/api/slack/workspaces", path: "/api/slack/workspaces" },
  { name: "/api/agents", path: "/api/agents" },
  { name: "/api/org/sentry-apps", path: "/api/org/sentry-apps" },
];

async function timeRequest(name: string, url: string): Promise<{ ms: number; status: number }> {
  const start = performance.now();
  const res = await fetch(url, {
    headers: { Accept: "application/json", Cookie: COOKIE },
    credentials: "include",
  });
  const ms = Math.round(performance.now() - start);
  return { ms, status: res.status };
}

async function main() {
  console.log(`Testing endpoints against ${BASE_URL}\n`);

  for (const { name, path } of endpoints) {
    const url = `${BASE_URL.replace(/\/$/, "")}${path}`;
    try {
      const { ms, status } = await timeRequest(name, url);
      console.log(`  ${name.padEnd(35)} ${String(ms).padStart(4)}ms  HTTP ${status}`);
    } catch (err) {
      console.log(`  ${name.padEnd(35)} ERROR  ${(err as Error).message}`);
    }
  }

  console.log("\nFor server-side breakdown, run server with LOG_PERF=1 and check logs.");
}

main();
