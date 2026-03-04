import type { Request, Response, NextFunction } from "express";

const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 1000;

interface WindowEntry {
  count: number;
  windowStart: number;
}

const windows = new Map<string, WindowEntry>();

// Prune stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  windows.forEach((entry, key) => {
    if (now - entry.windowStart > WINDOW_MS * 2) windows.delete(key);
  });
}, 5 * 60_000).unref();

/**
 * Per-token sliding-window rate limiter for agent ingest endpoints.
 * Keyed by req.agentId (set by authenticateAgentToken).
 * Limit: 1000 events per 60-second window.
 */
export function agentRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.agentId;
  if (!key) {
    res.status(401).json({ error: "Agent not authenticated" });
    return;
  }

  const now = Date.now();
  let entry = windows.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    windows.set(key, entry);
  }

  entry.count++;

  if (entry.count > MAX_EVENTS_PER_WINDOW) {
    const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    res.set("Retry-After", String(retryAfter));
    res.status(429).json({
      error: "Rate limit exceeded",
      limit: MAX_EVENTS_PER_WINDOW,
      window: "60s",
      retryAfter,
    });
    return;
  }

  next();
}
