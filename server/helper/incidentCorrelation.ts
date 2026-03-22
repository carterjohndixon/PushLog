/**
 * Incident-to-code correlation: extract stack trace location, resolve repo,
 * fetch GitHub commits that **added** the stack trace line (unified-diff '+' rows). Deterministic, non-blocking.
 */

import { decrypt } from "../encryption";
import type { GitHubCommitForCorrelation } from "../github";
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
  file: string;
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
    const line = parseFrameLine((f as { line?: unknown }).line);
    const key = normalized + ":" + (line ?? 0);
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({ file: normalized, line });
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

interface CommitDiffInfo {
  sha: string;
  /** True iff the stack trace line is a '+' line in the unified diff (real addition in that commit). */
  touchesErrorLine: boolean;
  /** Min |target - L| over added new-file lines L; Infinity if none. */
  closestLineDistance: number;
  addedNewFileLines: number[];
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
    if (!file?.patch) return fallback;

    const addedLines = parseAddedNewFileLineNumbers(file.patch);
    if (addedLines.length === 0) return fallback;

    const dist = closestDistanceToAddedLines(targetLine, addedLines);
    return {
      sha,
      touchesErrorLine: addedLines.includes(targetLine),
      closestLineDistance: dist,
      addedNewFileLines: addedLines,
    };
  } catch {
    return fallback;
  }
}

// --- Scoring and enrichment ---

const RECENCY_WINDOW_HOURS = 168; // 1 week
const MAX_RELATED_COMMITS = 5;
/** If no commit has a '+' exactly on the stack line, include commits whose nearest added line is within this distance. */
const NEAR_LINE_MAX_DISTANCE = 30;

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
}

/**
 * Rank commits that **added** the stack line (per unified-diff '+' rows). Caller should pass
 * only commits whose diff already matched the line; scoring is recency + tie-break.
 */
export function scoreAndRankCommits(
  commits: GitHubCommitForCorrelation[],
  location: CodeLocation,
  eventTime: string,
  diffInfos: Map<string, CommitDiffInfo>,
  limit: number = MAX_RELATED_COMMITS
): ScoredCommit[] {
  const eventTs = new Date(eventTime).getTime();

  const scored: ScoredCommit[] = commits.map((c) => {
    const commitTs = new Date(c.timestamp).getTime();
    const hoursSince = Math.max(0, (eventTs - commitTs) / (1000 * 60 * 60));
    const recencyScore = Math.max(0, 1 - hoursSince / RECENCY_WINDOW_HOURS);

    const diff = diffInfos.get(c.sha);
    const touchesErrorLine = diff?.touchesErrorLine === true;
    const lineDist = diff?.closestLineDistance;
    const dist =
      lineDist !== undefined && lineDist !== Infinity && Number.isFinite(lineDist) ? lineDist : undefined;
    let proximityBonus = 0;
    if (!touchesErrorLine && dist != null && dist <= NEAR_LINE_MAX_DISTANCE) {
      proximityBonus = 1.5 * (1 - dist / NEAR_LINE_MAX_DISTANCE);
    }

    const score = (touchesErrorLine ? 2.5 : 0) + proximityBonus + 1.0 * recencyScore;

    return {
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.message,
      author: { login: c.authorLogin, name: c.authorName },
      htmlUrl: c.htmlUrl,
      timestamp: c.timestamp,
      score: Math.round(score * 1000) / 1000,
      touchesErrorLine,
      lineDistance: lineDist !== Infinity ? lineDist : undefined,
    };
  });

  scored.sort((a, b) => {
    const d = b.score - a.score;
    if (d !== 0) return d > 0 ? 1 : -1;
    return a.sha.localeCompare(b.sha);
  });
  return scored.slice(0, limit);
}

export type CorrelationMatchMode = "exact_line" | "near_line" | "file";

export interface EnrichedCorrelation {
  relatedCommits: ScoredCommit[];
  relevantAuthors: Array<{ login: string; name?: string | null }>;
  correlationSource: "github" | null;
  correlatedFile?: string;
  correlatedLine?: number;
  /** How relatedCommits were chosen (exact '+' line, nearby additions, or file-level recency). */
  correlationMatch?: CorrelationMatchMode;
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
 * 4. Fetch each candidate's diff; keep only commits where a '+' line in the patch is exactly
 *    the stack trace line in the new file (same line number as reported in the trace).
 * 5. Rank survivors by recency.
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

  const commits = await listCommitsByPath(repo.owner, repo.repo, location.file, since, repo.token);
  if (!commits || commits.length === 0) return emptyCorrelation();

  const toCheck = commits.slice(0, MAX_DIFF_CHECKS);
  const diffResults = await Promise.all(
    toCheck.map((c) =>
      fetchCommitDiffForFile(repo.owner, repo.repo, c.sha, location.file, location.line, repo.token)
    )
  );
  const diffMap = new Map<string, CommitDiffInfo>();
  for (const d of diffResults) diffMap.set(d.sha, d);

  const lineHitCommits = commits.filter((c) => diffMap.get(c.sha)?.touchesErrorLine === true);
  let candidateCommits = lineHitCommits;
  let matchMode: CorrelationMatchMode = "exact_line";

  if (lineHitCommits.length === 0) {
    const nearCommits = commits.filter((c) => {
      const d = diffMap.get(c.sha)?.closestLineDistance;
      return typeof d === "number" && Number.isFinite(d) && d <= NEAR_LINE_MAX_DISTANCE;
    });
    if (nearCommits.length > 0) {
      candidateCommits = nearCommits;
      matchMode = "near_line";
    } else {
      candidateCommits = toCheck;
      matchMode = "file";
    }
  }

  if (candidateCommits.length === 0) return emptyCorrelation();

  const scored = scoreAndRankCommits(candidateCommits, location, summary.start_time, diffMap, MAX_RELATED_COMMITS);

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
    correlatedFile: location.file,
    correlatedLine: location.line,
    correlationMatch: matchMode,
  };
}
