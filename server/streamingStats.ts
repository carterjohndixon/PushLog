/**
 * PushLog Streaming Stats Engine — Node integration.
 * Fire-and-forget HTTP POST to the Rust stats service on each push event.
 * Stats are best-effort; failures are ignored and do not block the webhook.
 */

export interface IngestPayload {
  user_id: string;
  repository_id: string;
  impact_score: number;
  timestamp: string;
}

/**
 * Notify the streaming stats engine of a new push event.
 * No-op if STATS_ENGINE_URL is not set. Does not block or throw.
 */
export function ingestPushEvent(payload: IngestPayload): void {
  const baseUrl = process.env.STATS_ENGINE_URL;
  if (!baseUrl?.trim()) return;

  const url = `${baseUrl.replace(/\/$/, "")}/ingest`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Best-effort; ignore errors
  });
}
