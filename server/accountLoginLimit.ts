/**
 * Per-account login rate limiting (AUTH-VULN-11).
 * Limits failed login attempts per account identifier (email/username), not just per IP,
 * so distributed brute force (many IPs targeting one account) is throttled.
 *
 * In-memory store; for multi-instance deployments use Redis or DB-backed store.
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface Entry {
  failedCount: number;
  lockoutUntil: number;
}

const store = new Map<string, Entry>();

const MAX_STORE_SIZE = 50_000;
function pruneIfNeeded() {
  if (store.size <= MAX_STORE_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of Array.from(store.entries())) {
    if (entry.lockoutUntil < now) store.delete(key);
    if (store.size <= MAX_STORE_SIZE * 0.8) break;
  }
}

function getKey(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/**
 * Returns true if this account identifier is currently locked out due to too many failed attempts.
 */
export function isLockedOut(identifier: string): boolean {
  const key = getKey(identifier);
  const entry = store.get(key);
  if (!entry) return false;
  if (entry.lockoutUntil < Date.now()) {
    store.delete(key);
    return false;
  }
  return true;
}

/**
 * Seconds until lockout ends (for Retry-After header). 0 if not locked out.
 */
export function getRetryAfterSeconds(identifier: string): number {
  const key = getKey(identifier);
  const entry = store.get(key);
  if (!entry || entry.lockoutUntil < Date.now()) return 0;
  return Math.ceil((entry.lockoutUntil - Date.now()) / 1000);
}

/**
 * Record a failed login attempt for this identifier. Call on wrong password or user-not-found.
 */
export function recordFailedAttempt(identifier: string): void {
  const key = getKey(identifier);
  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = { failedCount: 0, lockoutUntil: 0 };
    store.set(key, entry);
  }
  if (entry.lockoutUntil > now) return; // already locked out, don't extend
  entry.failedCount += 1;
  if (entry.failedCount >= MAX_FAILED_ATTEMPTS) {
    entry.lockoutUntil = now + LOCKOUT_WINDOW_MS;
  }
  pruneIfNeeded();
}

/**
 * Clear failed attempts for this identifier. Call on successful login.
 */
export function clearAttempts(identifier: string): void {
  store.delete(getKey(identifier));
}
