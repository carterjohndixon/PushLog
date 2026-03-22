import { databaseStorage } from "../database";

/**
 * Gate in-app + email incident alerts by severity (Sentry + incident-engine + agent summaries).
 * Does not affect ingest into the incident engine or Sentry capture.
 *
 * `floor` values:
 *   - "all" / "any" / empty — notify for warning, error, and critical
 *   - "error" — skip warning-only; still notify error and critical
 *   - "critical" — only notify critical (Sentry fatal/critical level, or events tagged critical)
 */
export function shouldSendIncidentNotification(
  severity: "warning" | "error" | "critical",
  floor?: string
): boolean {
  const raw = (floor ?? process.env.INCIDENT_NOTIFICATION_MIN_SEVERITY ?? "all").trim().toLowerCase();
  if (raw === "" || raw === "all" || raw === "any") return true;
  if (raw === "error") return severity === "error" || severity === "critical";
  if (raw === "critical") return severity === "critical";
  return true;
}

/**
 * Resolve notification floor: org setting (organization_incident_settings) when the row exists,
 * otherwise INCIDENT_NOTIFICATION_MIN_SEVERITY, otherwise "all".
 */
export async function resolveIncidentNotificationFloor(
  organizationId: string | null | undefined
): Promise<string> {
  const envFloor = (process.env.INCIDENT_NOTIFICATION_MIN_SEVERITY || "all").trim().toLowerCase();
  if (!organizationId) {
    return envFloor === "" ? "all" : envFloor;
  }
  const row = await databaseStorage.getOrganizationIncidentSettings(organizationId);
  if (row) {
    const v = String(row.notificationMinSeverity ?? "")
      .trim()
      .toLowerCase();
    if (v === "all" || v === "error" || v === "critical") return v;
  }
  return envFloor === "" ? "all" : envFloor;
}
