/**
 * Gate in-app + email incident alerts by severity (Sentry + incident-engine + agent summaries).
 * Does not affect ingest into the incident engine or Sentry capture.
 *
 * INCIDENT_NOTIFICATION_MIN_SEVERITY:
 *   - unset, "all", or "any" — notify for warning, error, and critical (default / legacy behavior)
 *   - "error" — skip warning-only; still notify error and critical
 *   - "critical" — only notify critical (Sentry fatal/critical level, or events tagged critical)
 */
export function shouldSendIncidentNotification(
  severity: "warning" | "error" | "critical"
): boolean {
  const raw = (process.env.INCIDENT_NOTIFICATION_MIN_SEVERITY || "all").trim().toLowerCase();
  if (raw === "" || raw === "all" || raw === "any") return true;
  if (raw === "error") return severity === "error" || severity === "critical";
  if (raw === "critical") return severity === "critical";
  return true;
}
