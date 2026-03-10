// PM2 ecosystem config (.cjs for environments where only CJS is loaded)
// PM2 + Node apps can use env_file reliably, but your Rust binary (streaming-stats)
// is not receiving env_file vars. So we READ the env files ourselves and inject
// DATABASE_URL (and DATABASE_SSL_CA_PATH for Supabase) for streaming-stats.

const fs = require("fs");
const path = require("path");

// App deployment root — where .env.production / .env.staging live.
// Prefer explicit path; else deployment dir; else same dir as this config.
const APP_ROOT = process.env.PUSHLOG_APP_ROOT || "/var/www/pushlog" || path.resolve(__dirname);

function readEnvFile(filePath) {
  const abs = path.resolve(APP_ROOT, filePath);
  const out = {};
  if (!fs.existsSync(abs)) return out;
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch {
    return out;
  }
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();

    // Strip optional surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    out[key] = val;
  }
  return out;
}

const prodEnv = readEnvFile(".env.production");
const stagingEnv = readEnvFile(".env.staging");

// Fallback: if file parsing returned no DATABASE_URL, use process.env (e.g. from shell/systemd)
if (!prodEnv.DATABASE_URL && process.env.DATABASE_URL) prodEnv.DATABASE_URL = process.env.DATABASE_URL;
if (!stagingEnv.DATABASE_URL && process.env.STAGING_DATABASE_URL) stagingEnv.DATABASE_URL = process.env.STAGING_DATABASE_URL;

if (!prodEnv.DATABASE_URL) {
  console.error("ERROR: .env.production is missing DATABASE_URL");
}
if (!stagingEnv.DATABASE_URL) {
  console.error("ERROR: .env.staging is missing DATABASE_URL");
}
// streaming-stats + Supabase: Rust/sqlx requires the CA cert; without it the process will error in a loop
if (prodEnv.DATABASE_URL && /supabase\.(co|com)/i.test(prodEnv.DATABASE_URL) && !prodEnv.DATABASE_SSL_CA_PATH) {
  console.error(
    "WARNING: .env.production has Supabase DATABASE_URL but no DATABASE_SSL_CA_PATH. " +
    "streaming-stats-prod will keep failing until you add the Supabase DB cert path. " +
    "Download cert from Supabase Dashboard → Project Settings → Database, save e.g. to /var/www/pushlog/config/supabase-db.crt, set DATABASE_SSL_CA_PATH in .env.production."
  );
}

module.exports = {
  apps: [
    // -------------------------
    // PushLog API / Web (PROD)
    // -------------------------
    {
      name: "pushlog-prod",
      cwd: "/var/www/pushlog",
      script: "./dist/index.js",
      instances: 1,
      exec_mode: "cluster",
      autorestart: true,
      env_file: ".env.production",
      env: {
        NODE_ENV: "production",
        APP_ENV: "production",
        PORT: 3000,
        DATABASE_SSL: "true",
        NODE_OPTIONS: "--dns-result-order=ipv4first"
      }
    },

    // -------------------------
    // PushLog API / Web (STAGING)
    // -------------------------
    {
      name: "pushlog-staging",
      cwd: "/var/www/pushlog",
      script: "./dist/index.js",
      instances: 1,
      exec_mode: "cluster",
      autorestart: true,
      env_file: ".env.staging",
      env: {
        NODE_ENV: "production",
        APP_ENV: "staging",
        PORT: 3001,
        NODE_OPTIONS: "--dns-result-order=ipv4first"
      }
    },

    // -------------------------
    // Streaming Stats (PROD)
    // -------------------------
    {
      name: "streaming-stats-prod",
      cwd: "/var/www/pushlog",
      script: "./target/release/streaming-stats",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      env: {
        APP_ENV: "production",
        PORT: "5004",
        DATABASE_URL: prodEnv.DATABASE_URL,
        ...(prodEnv.DATABASE_SSL_CA_PATH && { DATABASE_SSL_CA_PATH: prodEnv.DATABASE_SSL_CA_PATH })
      }
    },

    // -------------------------
    // Streaming Stats (STAGING)
    // -------------------------
    {
      name: "streaming-stats-staging",
      cwd: "/var/www/pushlog",
      script: "./target/release/streaming-stats",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      env: {
        APP_ENV: "staging",
        PORT: "5005",
        DATABASE_URL: stagingEnv.DATABASE_URL
      }
    }
  ]
};
