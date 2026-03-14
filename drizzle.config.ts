import { defineConfig } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const root = path.join(path.dirname(__filename));
const appEnv = process.env.APP_ENV || process.env.NODE_ENV || "";
if (appEnv === "production" || appEnv === "staging") {
  dotenv.config({ path: path.join(root, `.env.${appEnv}`), override: true });
} else {
  dotenv.config({ path: path.join(root, ".env") });
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Set it in .env or run with APP_ENV=production (uses .env.production) or APP_ENV=staging (uses .env.staging).");
}

// When connecting to Supabase or any SSL DB, pg rejects self-signed certs by default.
// Append sslmode=no-verify so drizzle-kit push/introspect works (same as server's poolConnectionString).
function connectionUrlWithSsl(url: string): string {
  const useSsl =
    process.env.DATABASE_SSL === "true" ||
    process.env.DATABASE_SSL === "1" ||
    /supabase\.(co|com)/i.test(url) ||
    url.includes(":6543/");
  if (!useSsl) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("sslmode", "no-verify");
    return u.toString();
  } catch {
    return url;
  }
}

const databaseUrl = connectionUrlWithSsl(process.env.DATABASE_URL);

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
