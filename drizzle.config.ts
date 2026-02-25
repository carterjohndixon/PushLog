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

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
