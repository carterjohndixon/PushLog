/**
 * Incident-to-code correlation: extract stack trace location, resolve repo,
 * fetch GitHub commits, score by line-level proximity. Deterministic, non-blocking.
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
    const key = normalized + ":" + (f.line ?? 0);
    if (seen.has(key)) continue;
    seen.add(key);
    const line = typeof f.line === "number" && f.line > 0 ? f.line : undefined;
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
const LINE_PROXIMITY_WINDOW = 30;

interface CommitDiffInfo {
  sha: string;
  touchesErrorLine: boolean;
  closestLineDistance: number;
  changedLineRanges: Array<{ start: number; end: number }>;
}

/**
 * Parse a unified diff patch to extract changed line ranges in the new file.
 * Looks for @@ -old,count +new,count @@ hunks and collects the added/modified line numbers.
 */
function parseChangedLines(patch: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const hunkRe = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/gm;
  let match;
  while ((match = hunkRe.exec(patch)) !== null) {
    const start = parseInt(match[1], 10);
    const count = match[2] != null ? parseInt(match[2], 10) : 1;
    ranges.push({ start, end: start + Math.max(count - 1, 0) });
  }
  return ranges;
}

/**
 * Compute the closest distance between a target line and any changed line range.
 * Returns 0 if the target line is inside a changed range.
 */
function lineDistance(targetLine: number, ranges: Array<{ start: number; end: number }>): number {
  let closest = Infinity;
  for (const r of ranges) {
    if (targetLine >= r.start && targetLine <= r.end) return 0;
    closest = Math.min(closest, Math.abs(targetLine - r.start), Math.abs(targetLine - r.end));
  }
  return closest;
}

/**
 * Fetch a single commit's diff for a specific file and determine line proximity.
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
  const fallback: CommitDiffInfo = { sha, touchesErrorLine: false, closestLineDistance: Infinity, changedLineRanges: [] };
  if (targetLine == null) return { ...fallback, closestLineDistance: 0 };

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

    const ranges = parseChangedLines(file.patch);
    if (ranges.length === 0) return fallback;

    const dist = lineDistance(targetLine, ranges);
    return {
      sha,
      touchesErrorLine: dist === 0,
      closestLineDistance: dist,
      changedLineRanges: ranges,
    };
  } catch {
    return fallback;
  }
}

// --- Scoring and enrichment ---

const RECENCY_WINDOW_HOURS = 168; // 1 week
const MAX_RELATED_COMMITS = 5;
const MAX_DIFF_CHECKS = 8;

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
 * Score commits using line-level proximity + recency + stack position.
 *
 * Scoring breakdown:
 *   - Direct line hit (diff touches error line):  +3.0
 *   - Nearby lines (within 30 lines):             +2.0 * (1 - distance/30)
 *   - Recency (within 7 days):                    +1.0 * (1 - hours/168)
 *   - File match baseline:                        +0.5
 *
 * This means a commit that directly modified the error line last week
 * scores ~3.5, while a recent commit that touched a distant part of the
 * same file scores ~1.5.
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
    let lineScore = 0;
    let touchesErrorLine = false;
    let lineDist: number | undefined;

    if (diff) {
      lineDist = diff.closestLineDistance;
      if (diff.touchesErrorLine) {
        lineScore = 3.0;
        touchesErrorLine = true;
      } else if (diff.closestLineDistance <= LINE_PROXIMITY_WINDOW) {
        lineScore = 2.0 * (1 - diff.closestLineDistance / LINE_PROXIMITY_WINDOW);
      }
    }

    const score = 0.5 + lineScore + 1.0 * recencyScore;

    return {
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.message,
      author: { login: c.authorLogin, name: c.authorName },
      htmlUrl: c.htmlUrl,
      timestamp: c.timestamp,
      score: Math.round(score * 1000) / 1000,
      touchesErrorLine,
      lineDistance: lineDist,
    };
  });

  scored.sort((a, b) => {
    const d = b.score - a.score;
    if (d !== 0) return d > 0 ? 1 : -1;
    return a.sha.localeCompare(b.sha);
  });
  return scored.slice(0, limit);
}

export interface EnrichedCorrelation {
  relatedCommits: ScoredCommit[];
  relevantAuthors: Array<{ login: string; name?: string | null }>;
  correlationSource: "github" | null;
  correlatedFile?: string;
  correlatedLine?: number;
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
 * 4. For the top N commits, fetch their diffs to check which lines they changed
 * 5. Score by line proximity + recency → surface the most likely culprit
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

  const repo = await resolveRepoForIncident(summary.service, orgId, storage);
  if (!repo || !repo.token) return emptyCorrelation();

  const sinceDate = new Date(summary.start_time);
  sinceDate.setDate(sinceDate.getDate() - 7);
  const since = sinceDate.toISOString();

  const commits = await listCommitsByPath(repo.owner, repo.repo, location.file, since, repo.token);
  if (!commits || commits.length === 0) return emptyCorrelation();

  // Fetch diffs for the top candidates to determine line-level proximity.
  // Limit to MAX_DIFF_CHECKS to stay within rate limits.
  const toCheck = commits.slice(0, MAX_DIFF_CHECKS);
  const diffResults = await Promise.all(
    toCheck.map((c) =>
      fetchCommitDiffForFile(repo.owner, repo.repo, c.sha, location.file, location.line, repo.token)
    )
  );
  const diffMap = new Map<string, CommitDiffInfo>();
  for (const d of diffResults) diffMap.set(d.sha, d);

  const scored = scoreAndRankCommits(commits, location, summary.start_time, diffMap, MAX_RELATED_COMMITS);

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
  };
}
