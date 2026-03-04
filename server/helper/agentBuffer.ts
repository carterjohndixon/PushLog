import { ingestIncidentEvent, isNoiseEvent, type IncidentEventInput } from "../incidentEngine";

const FLUSH_INTERVAL_MS = 200;
const FLUSH_BATCH_SIZE = 50;
const MAX_BUFFER_SIZE = 5000;

let buffer: IncidentEventInput[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function flush(): void {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  for (const event of batch) {
    try {
      ingestIncidentEvent(event);
    } catch (err) {
      console.warn("[agentBuffer] ingest failed for event:", err);
    }
  }
}

function ensureTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  flushTimer.unref();
}

/**
 * Buffer an agent event for batched ingestion into the incident engine.
 * Flushes every 200ms or when 50 events accumulate, whichever comes first.
 */
export function bufferAgentEvent(event: IncidentEventInput): void {
  if (isNoiseEvent(event)) return;
  ensureTimer();
  if (buffer.length >= MAX_BUFFER_SIZE) {
    console.warn(`[agentBuffer] backpressure: dropping oldest event (buffer at ${MAX_BUFFER_SIZE})`);
    buffer.shift();
  }
  buffer.push(event);
  if (buffer.length >= FLUSH_BATCH_SIZE) flush();
}

/** Flush any remaining buffered events (call on graceful shutdown). */
export function flushAgentBuffer(): void {
  flush();
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
