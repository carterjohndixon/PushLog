import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Same env loading as index.ts: production/staging load ONLY their env file with override.
const root = path.join(__dirname, '..');
const appEnv = process.env.APP_ENV || process.env.NODE_ENV || '';
if (appEnv === 'production' || appEnv === 'staging') {
  dotenv.config({ path: path.join(root, `.env.${appEnv}`), override: true });
} else {
  dotenv.config({ path: path.join(root, '.env') });
  if (appEnv && appEnv !== 'development') {
    dotenv.config({ path: path.join(root, `.env.${appEnv}`), override: true });
  }
}

// Encryption key must be 32 bytes (64 hex chars) and STABLE across restarts.
// Without it, encrypted data (e.g. OpenRouter API key) cannot be decrypted after restart.
const RAW = process.env.ENCRYPTION_KEY;
const trimmed = typeof RAW === 'string' ? RAW.trim() : '';
// Accept 64 hex chars even if value had extra whitespace/newlines/quotes (strip non-hex, then require exactly 64)
const hexOnly = trimmed.replace(/[^a-fA-F0-9]/g, '');
const ENCRYPTION_KEY = hexOnly.length === 64 ? hexOnly : null;

if (process.env.NODE_ENV !== 'test') {
  if (trimmed.length > 0 && !ENCRYPTION_KEY) {
    const hint = trimmed.length === 64
      ? ' (key has 64 chars but at least one is not hex 0-9/a-f; check for spaces, newlines, or quotes in .env)'
      : trimmed.length === 66 && (trimmed.startsWith('"') || trimmed.startsWith("'"))
        ? ' (remove quotes around the value in .env)'
        : ` (got ${trimmed.length} chars after trim; need exactly 64 hex).`;
    console.warn(
      `⚠️ ENCRYPTION_KEY is invalid: must be exactly 64 hex characters (0-9, a-f).${hint} Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  } else if (trimmed.length === 0) {
    console.warn(
      '⚠️ ENCRYPTION_KEY is missing. Add it to .env (64 hex chars) so encrypted data (e.g. OpenRouter API key) persists. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts sensitive data using AES-256-GCM.
 * Requires ENCRYPTION_KEY in .env (64 hex chars); otherwise data cannot be decrypted after restart.
 */
export function encrypt(text: string): string {
  if (!text) return text;
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not set. Add a 64-character hex key to .env so encrypted data persists across restarts.');
  }
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // Return format: iv:authTag:encryptedData (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts data encrypted with the encrypt function.
 * If ENCRYPTION_KEY is missing or decryption fails, returns empty string (callers treat as "no key").
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return encryptedText;
  if (!ENCRYPTION_KEY) return '';
  // Check if this is encrypted data (has the expected format)
  if (!encryptedText.includes(':')) {
    return encryptedText;
  }
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      return encryptedText;
    }
    const [ivBase64, authTagBase64, encrypted] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    // Wrong key or corrupted data: return empty so callers treat as "no key" rather than using ciphertext
    return '';
  }
}

/**
 * Check if a string appears to be encrypted
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;
  const parts = text.split(':');
  return parts.length === 3 && parts.every(p => p.length > 0);
}

/**
 * Generate a new encryption key (for initial setup)
 * Run this once and store the result in ENCRYPTION_KEY env variable
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
