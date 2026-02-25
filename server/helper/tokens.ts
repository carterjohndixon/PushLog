/**
 * Invite token hashing and generation.
 * Store only hashes in DB; never log or persist raw tokens.
 */
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..", "..");
const appEnv = process.env.APP_ENV || process.env.NODE_ENV || "";
if (appEnv === "production" || appEnv === "staging") {
  dotenv.config({ path: path.join(root, `.env.${appEnv}`), override: true });
} else {
  dotenv.config({ path: path.join(root, ".env") });
}
const isProdLike = appEnv === "production" || appEnv === "staging";

const INVITE_SECRET = process.env.INVITE_TOKEN_SECRET || process.env.ENCRYPTION_KEY || "";

if (isProdLike && !INVITE_SECRET) {
  throw new Error(
    "Missing INVITE_TOKEN_SECRET (or ENCRYPTION_KEY fallback). Refusing to start in production/staging."
  );
}

/**
 * Hash a token for storage. Use this before saving to DB; never store raw token.
 * HMAC-SHA256 with INVITE_TOKEN_SECRET (fallback ENCRYPTION_KEY). Output base64url.
 */
export function hashToken(token: string): string {
  const key = Buffer.from(INVITE_SECRET, "utf8");
  const raw = crypto.createHmac("sha256", key).update(token).digest("base64");
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate a cryptographically secure join token (32 bytes, base64url).
 * Return the raw token once to the caller (e.g. to build join URL); caller must not persist it.
 * Store only hashToken(rawToken) in the database.
 */
export function generateJoinToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
