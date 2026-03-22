/**
 * Types and helpers for incident correlation UI: exact normalized line match evidence.
 */

export type ExactNormalizedLineMatchEvidence = {
  type: "exact_normalized_line_match";
  sourceLine: string;
  matchedPatchLine: string;
};

export type IncidentExactLineMatch = {
  matched?: boolean;
  sourceLine: string;
  matchedLine: string;
};

/** Related commit as returned in incident notification metadata (partial). */
export type RelatedCommitForCorrelation = {
  sha?: string;
  shortSha?: string;
  correlationEvidence?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function getExactLineMatchEvidence(
  commit: RelatedCommitForCorrelation | null | undefined,
): ExactNormalizedLineMatchEvidence | null {
  if (!commit || !Array.isArray(commit.correlationEvidence)) return null;
  for (const raw of commit.correlationEvidence) {
    if (!isRecord(raw)) continue;
    if (raw.type !== "exact_normalized_line_match") continue;
    const sourceLine = raw.sourceLine;
    const matchedPatchLine = raw.matchedPatchLine;
    if (typeof sourceLine !== "string" && typeof matchedPatchLine !== "string") continue;
    const sl = typeof sourceLine === "string" ? sourceLine : "";
    const mp = typeof matchedPatchLine === "string" ? matchedPatchLine : "";
    if (!sl.trim() && !mp.trim()) continue;
    return {
      type: "exact_normalized_line_match",
      sourceLine: sl,
      matchedPatchLine: mp,
    };
  }
  return null;
}

export function hasExactLineMatch(commit: RelatedCommitForCorrelation | null | undefined): boolean {
  return getExactLineMatchEvidence(commit) != null;
}

export function trimCodeText(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

/** API: POST /api/debug/test-exact-line-match */
export type ExactLineMatchTestResponse = {
  ok: boolean;
  error?: string;
  detail?: string;
  incidentId?: string;
  notificationId?: string;
  codeLocation?: { file: string; repoPath: string; line?: number };
  exactLineMatch?: IncidentExactLineMatch;
  relatedCommits?: RelatedCommitForCorrelation[];
  correlationMatch?: string;
  correlatedFile?: string;
  correlatedLine?: number;
  resolvedSourceLine?: string | null;
  debug?: {
    sourceLine?: string | null;
    matchedCommitShas?: string[];
    exactNormalizedEvidence?: Array<{
      commitSha?: string;
      type?: string;
      sourceLine?: string;
      matchedPatchLine?: string;
    }>;
    checkedCommitCount?: number;
    correlationSource?: string | null;
  };
  stacktraceUsed?: Array<{ file?: string; line?: number }>;
  correlationFull?: unknown;
  hint?: string;
};
