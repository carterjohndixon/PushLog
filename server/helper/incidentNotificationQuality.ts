/**
 * Filters noisy incident-engine summaries before in-app + email notifications.
 * Does not affect ingest; only reduces alert fatigue for low-signal incidents.
 *
 * Opt out: INCIDENT_SUPPRESS_LOW_SIGNAL=false
 *
 * Typical noise: self-referential messages containing "[incident-engine]", or
 * `new_issue` with no app stack frames and generic titles (e.g. "New issue: Error in app/production").
 */

import type { IncidentSummaryOutput } from "../incidentEngine";
import { isAppStackFrame } from "./stackTraceBundled";

/** Incident summary JSON from Rust engine (extends typed fields with optional symptom/stack data). */
export type IncidentSummaryPayload = IncidentSummaryOutput &
  Record<string, unknown> & {
    top_symptoms?: Array<{ message?: string; exception_type?: string }>;
    stacktrace?: Array<{ file?: string; function?: string; line?: number }>;
  };

function envSuppressEnabled(): boolean {
  const v = process.env.INCIDENT_SUPPRESS_LOW_SIGNAL?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return true;
}

/** Generic Sentry-style title with no class name — often unactionable without real frames. */
function isGenericNewIssueTitle(title: string): boolean {
  const t = title.trim();
  return /^new issue:\s*error in\s+[^/]+\/[^/]+\s*$/i.test(t);
}

/**
 * Returns true if we should skip notifications for this summary (still logged at info in caller).
 */
export function shouldSuppressLowSignalIncident(summary: IncidentSummaryPayload): { suppress: boolean; reason?: string } {
  if (!envSuppressEnabled()) {
    return { suppress: false };
  }

  const title = String(summary.title ?? "");
  const topSymptoms = summary.top_symptoms ?? [];
  const firstMsg = topSymptoms[0]?.message != null ? String(topSymptoms[0].message).trim() : "";
  const combinedText = `${title}\n${firstMsg}`;

  // Engine / pipeline echoing itself into the symptom (very common noise).
  if (/\[incident-engine\]/i.test(combinedText)) {
    return { suppress: true, reason: "contains_incident_engine_meta" };
  }

  const rawStack = summary.stacktrace ?? [];
  const appFrames = rawStack.filter((f) => isAppStackFrame(f?.file));

  // new_issue with no in-app frames: often a classification stub, not a ready-to-debug event.
  if (summary.trigger === "new_issue" && appFrames.length === 0) {
    if (isGenericNewIssueTitle(title)) {
      return { suppress: true, reason: "new_issue_no_app_frames_generic_title" };
    }
    const minP = Number.parseInt(process.env.INCIDENT_SUPPRESS_NEW_ISSUE_MAX_PRIORITY ?? "55", 10);
    const maxPriorityToSuppress = Number.isFinite(minP) ? minP : 55;
    if (
      typeof summary.priority_score === "number" &&
      summary.priority_score <= maxPriorityToSuppress &&
      (!firstMsg || firstMsg.length < 12)
    ) {
      return { suppress: true, reason: "new_issue_low_priority_no_message" };
    }
  }

  return { suppress: false };
}
