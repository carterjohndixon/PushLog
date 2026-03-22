/**
 * Incident-to-code correlation: extract stack trace location, resolve repo,
 * attribute the stack line via **git blame** on the default branch (correct for current line numbers),
 * optionally supplement with commits whose diff has a '+' exactly on that line. No misleading "near line"
 * matches across unrelated hunks. Deterministic, non-blocking.
 */

import { decrypt } from "../encryption";
import type { GitHubCommitForCorrelation } from "../github";
import {
  fetchBlameCommitForLine,
  getExactSourceLine,
  getRepositoryDefaultBranchName,
} from "../github";
import { isAppStackFrame } from "./stackTraceBundled";

// --- Path normalization ---

const UNMAPPABLE_PATTERNS = [
  /node_modules/i,
  /chunk-/i,
  /\.min\.js$/i,
  /bundle/i,
  /vendor\//i,
  /\/vendor\//i,
  /static\//i,
  /\/static\//i,
  /assets\//i,
  /\/assets\//i,
  /\bdist\//i,
  /\bbuild\//i,
  /\bout\//i,
];

const SOURCE_HINT_PATTERNS = [
  /\.(tsx?|jsx?|vue|svelte)(\?|$)/i,
  /\.(mjs|cjs)(\?|$)/i,
  /\.(py|rb|go|rs|java|kt|scala|cs)(\?|$)/i,
  /\/src\//i,
  /\/app\//i,
  /\/client\//i,
  /\/lib\//i,
  /\/server\//i,
  /\/components\//i,
  /\/pages\//i,
  /\/internal\//i,
  /\/handlers?\//i,
  /\/middleware\//i,
  /\/routes?\//i,
  /\/helpers?\//i,
  /\/utils?\//i,
];

export function normalizeStackPath(p: string): string {
  if (!p || typeof p !== "string") return "";
  let s = p.trim();
  s = s.replace(/\\/g, "/");
  s = s.replace(/\/+/g, "/");
  s = s.replace(/^(\.\.?\/)+/, "");
  s = s.replace(/^\//, "");
  return s.toLowerCase();
}

/** Repo-relative path for GitHub APIs (slashes, no leading `/`); preserves case from the stack frame. */
export function normalizeRepoPathForApi(p: string): string {
  if (!p || typeof p !== "string") return "";
  let s = p.trim();
  s = s.replace(/\\/g, "/");
  s = s.replace(/\/+/g, "/");
  s = s.replace(/^(\.\.?\/)+/, "");
  s = s.replace(/^\//, "");
  return s;
}

export function isMappablePath(p: string): boolean {
  const path = normalizeStackPath(p);
  if (!path) return false;
  for (const re of UNMAPPABLE_PATTERNS) {
    if (re.test(path)) return false;
  }
  return SOURCE_HINT_PATTERNS.some((re) => re.test(path));
}

// --- Location extraction ---

export interface CodeLocation {
  /** Lowercase normalized path for matching / display consistency. */
  file: string;
  /** Path as sent to GitHub (list commits, blame); preserves original casing. */
  repoPath: string;
  line?: number;
}

/**
 * Extract ALL mappable code locations from the stack trace (ordered by frame position).
 * The first is the "best" (closest to the error), but we use all of them for scoring.
 */
/** Coerce stack frame line from JSON (number or numeric string). */
export function parseFrameLine(line: unknown): number | undefined {
  if (line == null) return undefined;
  if (typeof line === "number" && Number.isFinite(line) && line > 0) return Math.trunc(line);
  if (typeof line === "string") {
    const n = parseInt(line.trim(), 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return undefined;
}

export function extractCodeLocations(
  stacktrace: Array<{ file?: string; line?: number }>
): CodeLocation[] {
  if (!Array.isArray(stacktrace) || stacktrace.length === 0) return [];
  const locations: CodeLocation[] = [];
  const seen = new Set<string>();
  for (const f of stacktrace) {
    if (!f?.file) continue;
    const raw = String(f.file);
    if (!isAppStackFrame(raw)) continue;
    const normalized = normalizeStackPath(raw);
    if (!normalized || !isMappablePath(normalized)) continue;
    const repoPath = normalizeRepoPathForApi(raw);
    if (!repoPath) continue;
    const line = parseFrameLine((f as { line?: unknown }).line);
    const key = normalized + ":" + (line ?? 0);
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({ file: normalized, repoPath, line });
  }
  return locations;
}

export function extractBestCodeLocation(
  stacktrace: Array<{ file?: string; line?: number }>
): CodeLocation | null {
  return extractCodeLocations(stacktrace)[0] ?? null;
}

// --- Repo resolution ---

export interface ResolvedRepo {
  owner: string;
  repo: string;
  fullName: string;
  token: string;
}

type RepoShape = { userId: string; organizationId: string | null; owner: string; name: string; fullName: string; incidentServiceName: string | null };

function normalizeService(s: string): string {
  return String(s || "").trim().toLowerCase();
}

async function getGitHubTokenForRepo(
  repo: RepoShape,
  orgId: string | null,
  storage: { getUser: (id: string) => Promise<{ githubToken?: string | null } | undefined>; getOrganizationMembersWithUsers?: (id: string) => Promise<Array<{ userId: string }>> }
): Promise<string | null> {
  const tryUser = async (userId: string): Promise<string | null> => {
    const user = await storage.getUser(userId);
    const raw = (user as any)?.githubToken;
    if (!raw || typeof raw !== "string") return null;
    const token = raw.startsWith("ghp_") || raw.startsWith("gho_") ? raw : decrypt(raw);
    return token && token.trim() ? token : null;
  };

  let token = await tryUser(repo.userId);
  if (token) return token;

  if (orgId && storage.getOrganizationMembersWithUsers) {
    const members = await storage.getOrganizationMembersWithUsers(orgId);
    for (const m of members) {
      token = await tryUser(m.userId);
      if (token) return token;
    }
  }

  const pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim();
  return pat || null;
}

export async function resolveRepoForIncident(
  service: string,
  orgId: string | null,
  storage: {
    getRepositoriesByOrganizationId: (id: string) => Promise<RepoShape[]>;
    getUser: (id: string) => Promise<{ githubToken?: string | null } | undefined>;
    getOrganizationMembersWithUsers?: (id: string) => Promise<Array<{ userId: string }>>;
  }
): Promise<ResolvedRepo | null> {
  if (!orgId) return null;
  const repos = await storage.getRepositoriesByOrganizationId(orgId);
  if (!repos || repos.length === 0) return null;

  const svc = normalizeService(service);

  for (const repo of repos) {
    const inc = repo.incidentServiceName ? normalizeService(repo.incidentServiceName) : "";
    if (inc && inc === svc) {
      const token = await getGitHubTokenForRepo(repo, repo.organizationId || orgId, storage);
      if (token) {
        return { owner: repo.owner, repo: repo.name, fullName: repo.fullName, token };
      }
    }
  }

  if (repos.length === 1) {
    const token = await getGitHubTokenForRepo(repos[0], repos[0].organizationId || orgId, storage);
    if (token) {
      return { owner: repos[0].owner, repo: repos[0].name, fullName: repos[0].fullName, token };
    }
  }

  return null;
}

// --- Line-level diff analysis ---

const DIFF_FETCH_TIMEOUT_MS = 4000;
/** Max commits to diff-check (GitHub listCommitsByPath returns up to 20). */
const MAX_DIFF_CHECKS = 20;

export interface CommitDiffInfo {
  sha: string;
  /** True iff the stack trace line is a '+' line in the unified diff (real addition in that commit). */
  touchesErrorLine: boolean;
  /** Min |target - L| over added new-file lines L; Infinity if none. */
  closestLineDistance: number;
  addedNewFileLines: number[];
  patch: string | null;
  /** Normalized source line text matches an added (+) line in the patch. */
  exactNormalizedLineMatch?: boolean;
  exactMatchPatchLine?: string;
}

const unifiedHunkHeaderRe = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/;

/**
 * Walk a unified diff and collect line numbers in the **new** file that come from '+' rows
 * (additions). Context (' ') and deletions ('-') do not add line numbers to this set.
 */
export function parseAddedNewFileLineNumbers(patch: string): number[] {
  const added: number[] = [];
  let newLine = 0;
  let inHunk = false;
  for (const row of patch.split("\n")) {
    const hm = row.match(unifiedHunkHeaderRe);
    if (hm) {
      newLine = parseInt(hm[1], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (row === "\\ No newline at end of file") continue;
    if (row.startsWith("diff --git ") || row.startsWith("index ")) {
      inHunk = false;
      continue;
    }
    const c0 = row[0];
    if (c0 === "+" && !row.startsWith("+++")) {
      added.push(newLine);
      newLine++;
    } else if (c0 === "-") {
      // Old-file only; new file line counter unchanged.
    } else if (c0 === " ") {
      newLine++;
    } else if (row === "") {
      newLine++;
    }
  }
  return added;
}

// --- Exact normalized line match (pure helpers) ---

export function normalizeLineForExactMatch(line: string): string {
  let s = String(line ?? "").trim();
  s = s.replace(/\s+/g, " ");
  if (s.endsWith(";")) {
    s = s.slice(0, -1).trim();
  }
  return s.trim();
}

/** True when the line is only brackets, parens, commas, semicolons, colons, spaces, and/or `=>`. */
const STRUCTURAL_ONLY_LINE = /^(?:[\{\}\[\]\(\)\s;,:]|=>)+$/;

export function isDistinctiveEnoughForExactLineMatch(line: string): boolean {
  const t = String(line ?? "").trim();
  if (!t) return false;
  if (t.length < 8) return false;
  if (STRUCTURAL_ONLY_LINE.test(t)) return false;
  return true;
}

export function extractAddedLinesFromPatch(patch: string): string[] {
  if (!patch) return [];
  const out: string[] = [];
  for (const row of patch.split(/\r?\n/)) {
    if (row.startsWith("+") && !row.startsWith("+++")) {
      out.push(row.slice(1));
    }
  }
  return out;
}

export function findExactNormalizedLineMatch(
  sourceLine: string,
  patch: string
): { matched: boolean; matchedLine?: string } {
  if (!isDistinctiveEnoughForExactLineMatch(sourceLine)) {
    return { matched: false };
  }
  const normSource = normalizeLineForExactMatch(sourceLine);
  const added = extractAddedLinesFromPatch(patch);
  for (const addedRaw of added) {
    if (!isDistinctiveEnoughForExactLineMatch(addedRaw)) continue;
    if (normalizeLineForExactMatch(addedRaw) === normSource) {
      return { matched: true, matchedLine: addedRaw };
    }
  }
  return { matched: false };
}

function closestDistanceToAddedLines(targetLine: number, addedLines: number[]): number {
  if (addedLines.length === 0) return Infinity;
  let closest = Infinity;
  for (const L of addedLines) {
    const d = Math.abs(targetLine - L);
    if (d < closest) closest = d;
  }
  return closest;
}

/**
 * Fetch a single commit's diff for a specific file; see if a '+' row lands on `targetLine` in the new file.
 * Uses GitHub's commit API with diff media type.
 */
async function fetchCommitDiffForFile(
  owner: string,
  repo: string,
  sha: string,
  filePath: string,
  targetLine: number | undefined,
  token: string,
): Promise<CommitDiffInfo> {
  const fallback: CommitDiffInfo = {
    sha,
    touchesErrorLine: false,
    closestLineDistance: Infinity,
    addedNewFileLines: [],
    patch: null,
  };
  if (targetLine == null || targetLine <= 0) return fallback;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DIFF_FETCH_TIMEOUT_MS);
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`;
    const resp = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) return fallback;

    const data = await resp.json() as { files?: Array<{ filename?: string; patch?: string }> };
    const normalizedTarget = filePath.toLowerCase();
    const file = data.files?.find((f) => f.filename?.toLowerCase() === normalizedTarget || f.filename?.toLowerCase().endsWith("/" + normalizedTarget));
    if (!file?.patch) return { ...fallback, sha };

    const addedLines = parseAddedNewFileLineNumbers(file.patch);
    if (addedLines.length === 0) {
      return { ...fallback, sha, patch: file.patch };
    }

    const dist = closestDistanceToAddedLines(targetLine, addedLines);
    return {
      sha,
      touchesErrorLine: addedLines.includes(targetLine),
      closestLineDistance: dist,
      addedNewFileLines: addedLines,
      patch: file.patch,
    };
  } catch {
    return fallback;
  }
}

// --- Scoring and enrichment ---

const RECENCY_WINDOW_HOURS = 168; // 1 week
const MAX_RELATED_COMMITS = 5;
/** Score boost so blame attribution sorts ahead of diff-only matches. */
const BLAME_SCORE_BASE = 10;
/** Extra weight when normalized source text equals an added line in the commit patch. */
const EXACT_NORMALIZED_LINE_SCORE_BONUS = 40;

export type CorrelationEvidenceExactNormalizedLine = {
  type: "exact_normalized_line_match";
  sourceLine: string;
  matchedPatchLine: string;
};

export interface ScoredCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: { login: string; name?: string | null };
  htmlUrl: string;
  timestamp: string;
  score: number;
  touchesErrorLine?: boolean;
  lineDistance?: number;
  /** Present when this row came from default-branch git blame (authoritative for current line numbers). */
  fromBlame?: boolean;
  correlationEvidence?: CorrelationEvidenceExactNormalizedLine[];
}

/**
 * Rank commits using recency plus a bonus when the unified diff has a '+' on the stack line.
 * Caller supplies the diff map; commits with no entry are scored on recency only (file fallback).
 */
export function scoreAndRankCommits(
  commits: GitHubCommitForCorrelation[],
  location: CodeLocation,
  eventTime: string,
  diffInfos: Map<string, CommitDiffInfo>,
  limit: number = MAX_RELATED_COMMITS,
  sourceLineForExactEvidence?: string | null
): ScoredCommit[] {
  const eventTs = new Date(eventTime).getTime();

  const scored: ScoredCommit[] = commits.map((c) => {
    const commitTs = new Date(c.timestamp).getTime();
    const hoursSince = Math.max(0, (eventTs - commitTs) / (1000 * 60 * 60));
    const recencyScore = Math.max(0, 1 - hoursSince / RECENCY_WINDOW_HOURS);

    const diff = diffInfos.get(c.sha);
    const touchesErrorLine = diff?.touchesErrorLine === true;
    const exactMatch = diff?.exactNormalizedLineMatch === true;

    const score =
      (exactMatch ? EXACT_NORMALIZED_LINE_SCORE_BONUS : 0) +
      (touchesErrorLine ? 2.5 : 0) +
      1.0 * recencyScore;

    const correlationEvidence: CorrelationEvidenceExactNormalizedLine[] | undefined =
      exactMatch && sourceLineForExactEvidence && diff?.exactMatchPatchLine != null
        ? [
            {
              type: "exact_normalized_line_match",
              sourceLine: sourceLineForExactEvidence,
              matchedPatchLine: diff.exactMatchPatchLine,
            },
          ]
        : undefined;

    return {
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.message,
      author: { login: c.authorLogin, name: c.authorName },
      htmlUrl: c.htmlUrl,
      timestamp: c.timestamp,
      score: Math.round(score * 1000) / 1000,
      touchesErrorLine,
      ...(correlationEvidence ? { correlationEvidence } : {}),
    };
  });

  scored.sort((a, b) => {
    const d = b.score - a.score;
    if (d !== 0) return d > 0 ? 1 : -1;
    return a.sha.localeCompare(b.sha);
  });
  return scored.slice(0, limit);
}

export type CorrelationMatchMode = "blame_line" | "exact_line" | "file";

export interface EnrichedCorrelation {
  relatedCommits: ScoredCommit[];
  relevantAuthors: Array<{ login: string; name?: string | null }>;
  correlationSource: "github" | null;
  correlatedFile?: string;
  correlatedLine?: number;
  /** How relatedCommits were chosen (blame on default branch, exact '+' in a recent diff, or file recency). */
  correlationMatch?: CorrelationMatchMode;
  /** Present when a commit patch contained the same normalized line as the source at the stack location. */
  exactLineMatch?: {
    matched: boolean;
    sourceLine: string;
    matchedLine: string;
  };
}

function emptyCorrelation(): EnrichedCorrelation {
  return { relatedCommits: [], relevantAuthors: [], correlationSource: null };
}

/**
 * Enrich incident with line-level GitHub commit correlation.
 * 
 * 1. Extract best code location from resolved stack trace
 * 2. Resolve the GitHub repo via incidentServiceName
 * 3. Fetch recent commits that touched the affected file
 * 4. Git blame on the default branch for (repoPath, line) → primary attribution.
 * 5. Optionally include other recent commits whose unified diff has a '+' exactly on that line.
 * 6. If neither applies, fall back to recent commits touching the file (no line-distance guesses).
 *
 * Never throws; returns empty on any failure.
 */
export async function enrichIncidentWithGitHubCorrelation(
  summary: {
    service: string;
    start_time: string;
    stacktrace?: Array<{ file?: string; line?: number }>;
  },
  orgId: string | null,
  storage: {
    getRepositoriesByOrganizationId: (id: string) => Promise<RepoShape[]>;
    getUser: (id: string) => Promise<{ githubToken?: string | null } | undefined>;
    getOrganizationMembersWithUsers?: (id: string) => Promise<Array<{ userId: string }>>;
  },
  listCommitsByPath: (
    owner: string,
    repo: string,
    path: string,
    since: string,
    token?: string | null
  ) => Promise<GitHubCommitForCorrelation[]>
): Promise<EnrichedCorrelation> {
  if (!orgId) return emptyCorrelation();

  const location = extractBestCodeLocation(summary.stacktrace || []);
  if (!location || !isMappablePath(location.file)) return emptyCorrelation();
  if (location.line == null || location.line <= 0) return emptyCorrelation();

  const repo = await resolveRepoForIncident(summary.service, orgId, storage);
  if (!repo || !repo.token) return emptyCorrelation();

  const sinceDate = new Date(summary.start_time);
  sinceDate.setDate(sinceDate.getDate() - 7);
  const since = sinceDate.toISOString();

  const blameRow = await fetchBlameCommitForLine(
    repo.owner,
    repo.repo,
    location.repoPath,
    location.line,
    repo.token
  );

  const commits = await listCommitsByPath(repo.owner, repo.repo, location.repoPath, since, repo.token);
  if ((!commits || commits.length === 0) && !blameRow) return emptyCorrelation();

  const safeCommits = commits || [];
  const toCheck = safeCommits.slice(0, MAX_DIFF_CHECKS);

  let sourceRef: string | null = blameRow?.sha ?? null;
  if (!sourceRef && toCheck.length > 0) {
    sourceRef = await getRepositoryDefaultBranchName(repo.owner, repo.repo, repo.token);
  }

  let rawSourceLine: string | null = null;
  if (toCheck.length > 0 && sourceRef) {
    rawSourceLine = await getExactSourceLine(
      repo.owner,
      repo.repo,
      location.repoPath,
      sourceRef,
      location.line!,
      repo.token
    );
  }

  const diffMap = new Map<string, CommitDiffInfo>();
  if (toCheck.length > 0) {
    const diffResults = await Promise.all(
      toCheck.map((c) =>
        fetchCommitDiffForFile(repo.owner, repo.repo, c.sha, location.file, location.line, repo.token)
      )
    );
    for (const d of diffResults) diffMap.set(d.sha, d);

    if (rawSourceLine) {
      for (const info of Array.from(diffMap.values())) {
        if (!info.patch) continue;
        const hit = findExactNormalizedLineMatch(rawSourceLine, info.patch);
        if (hit.matched && hit.matchedLine) {
          info.exactNormalizedLineMatch = true;
          info.exactMatchPatchLine = hit.matchedLine;
        }
      }
    }
  }

  const lineHitCommits = safeCommits.filter((c) => {
    const d = diffMap.get(c.sha);
    return d?.touchesErrorLine === true || d?.exactNormalizedLineMatch === true;
  });
  let matchMode: CorrelationMatchMode;
  const merged: ScoredCommit[] = [];
  const shaSeen = new Set<string>();

  if (blameRow) {
    const blameDiff = diffMap.get(blameRow.sha);
    let blameScore = BLAME_SCORE_BASE;
    const blameEvidence: CorrelationEvidenceExactNormalizedLine[] = [];
    if (
      blameDiff?.exactNormalizedLineMatch &&
      rawSourceLine &&
      blameDiff.exactMatchPatchLine != null
    ) {
      blameScore += EXACT_NORMALIZED_LINE_SCORE_BONUS;
      blameEvidence.push({
        type: "exact_normalized_line_match",
        sourceLine: rawSourceLine,
        matchedPatchLine: blameDiff.exactMatchPatchLine,
      });
    }
    merged.push({
      sha: blameRow.sha,
      shortSha: blameRow.sha.slice(0, 7),
      message: blameRow.message,
      author: { login: blameRow.authorLogin, name: blameRow.authorName },
      htmlUrl: blameRow.htmlUrl,
      timestamp: blameRow.timestamp,
      score: blameScore,
      touchesErrorLine: true,
      fromBlame: true,
      ...(blameEvidence.length ? { correlationEvidence: blameEvidence } : {}),
    });
    shaSeen.add(blameRow.sha);
    matchMode = "blame_line";
  } else if (lineHitCommits.length > 0) {
    matchMode = "exact_line";
  } else {
    matchMode = "file";
  }

  if (lineHitCommits.length > 0) {
    const scoredExact = scoreAndRankCommits(
      lineHitCommits,
      location,
      summary.start_time,
      diffMap,
      MAX_RELATED_COMMITS,
      rawSourceLine
    );
    for (const row of scoredExact) {
      if (shaSeen.has(row.sha)) continue;
      merged.push({ ...row, fromBlame: false });
      shaSeen.add(row.sha);
    }
  }

  if (merged.length === 0 && safeCommits.length > 0) {
    const scoredFile = scoreAndRankCommits(
      safeCommits,
      location,
      summary.start_time,
      diffMap,
      MAX_RELATED_COMMITS,
      rawSourceLine
    );
    for (const row of scoredFile) {
      if (shaSeen.has(row.sha)) continue;
      merged.push(row);
      shaSeen.add(row.sha);
    }
  }

  if (merged.length === 0) return emptyCorrelation();

  merged.sort((a, b) => {
    const d = b.score - a.score;
    if (d !== 0) return d > 0 ? 1 : -1;
    return a.sha.localeCompare(b.sha);
  });
  const scored = merged.slice(0, MAX_RELATED_COMMITS);

  let exactLineMatch: EnrichedCorrelation["exactLineMatch"];
  for (const c of scored) {
    const ev = c.correlationEvidence?.find((e) => e.type === "exact_normalized_line_match");
    if (ev) {
      exactLineMatch = {
        matched: true,
        sourceLine: ev.sourceLine,
        matchedLine: ev.matchedPatchLine,
      };
      break;
    }
  }

  const seen = new Set<string>();
  const authors = scored
    .map((c) => c.author.login)
    .filter((login) => {
      if (seen.has(login)) return false;
      seen.add(login);
      return true;
    })
    .map((login) => {
      const c = scored.find((x) => x.author.login === login);
      return { login, name: c?.author.name ?? null };
    });

  return {
    relatedCommits: scored,
    relevantAuthors: authors,
    correlationSource: "github",
    correlatedFile: location.repoPath,
    correlatedLine: location.line,
    correlationMatch: matchMode,
    ...(exactLineMatch ? { exactLineMatch } : {}),
  };
}
