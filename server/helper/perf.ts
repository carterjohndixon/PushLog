/**
 * Simple performance timing for debugging slow requests.
 * Enable with LOG_PERF=1 in the environment.
 */

const ENABLED = process.env.LOG_PERF === "1" || process.env.LOG_PERF === "true";

export function perfLog(label: string, ms: number, meta?: Record<string, number>): void {
  if (!ENABLED) return;
  const metaStr = meta && Object.keys(meta).length > 0
    ? " " + Object.entries(meta).map(([k, v]) => `${k}=${v}ms`).join(" ")
    : "";
  console.log(`[perf] ${label}: ${ms}ms${metaStr}`);
}

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    perfLog(label, Date.now() - start);
  }
}

export function startTimer(): { elapsed: () => number; log: (label: string) => void } {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start,
    log: (label: string) => perfLog(label, Date.now() - start),
  };
}
