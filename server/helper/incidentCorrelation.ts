/**
 * Incident-to-code correlation: extract stack trace location, resolve repo,
 * fetch GitHub commits, score and rank. Rule-based, deterministic, non-blocking.
 */

import { decrypt } from "../encryption";
import type { GitHubCommitForCorrelation } from "../github";
import { isAppStackFrame } from "./stackTraceBundled";

// --- Path normalization (conservative, no fuzzy matching) ---

/** Patterns that indicate unmappable paths (bundled, vendor, etc.). */
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
];

/** Source hints: path must have at least one to be mappable. */
const SOURCE_HINT_PATTERNS = [
  /\.(tsx?|jsx?|vue|svelte)(\?|$)/i,
  /\.(mjs|cjs)(\?|$)/i,
  /\/src\//i,
  /\/app\//i,
  /\/client\//i,
  /\/lib\//i,
  /\/server\//i,
  /\/components\//i,
  /\/pages\//i,
];

/**
 * Normalize a stack trace file path for GitHub matching.
 * Conservative: separators, prefixes, case only. No fuzzy matching.
 */
export function normalizeStackPath(p: string): string {
  if (!p || typeof p !== "string") return "";
  let s = p.trim();
  s = s.replace(/\\/g, "/");
  s = s.replace(/\/+/g, "/");
  s = s.replace(/^\.\//, "");
  s = s.replace(/^\//, "");
  return s.toLowerCase();
}

/**
 * True if the path is mappable to a repo (not bundled/vendor, has source hint).
 */
export function isMappablePath(p: string): boolean {
  const path = normalizeStackPath(p);
  if (!path) return false;

  for (const re of UNMAPPABLE_PATTERNS) {
    if (re.test(path)) return false;
  }

  const hasSourceHint = SOURCE_HINT_PATTERNS.some((re) => re.test(path));
  if (!hasSourceHint) return false;

  return true;
}

// --- Location extraction ---

export interface CodeLocation {
  file: string;
  line?: number;
}

/**
 * Extract the best code location from stack trace (first app frame).
 */
export function extractBestCodeLocation(
  stacktrace: Array<{ file?: string; line?: number }>
): CodeLocation | null {
  if (!Array.isArray(stacktrace) || stacktrace.length === 0) return null;
  const frame = stacktrace.find((f) => f?.file && isAppStackFrame(String(f.file)));
  if (!frame?.file) return null;
  const file = normalizeStackPath(String(frame.file));
  if (!file) return null;
  const line = typeof frame.line === "number" && frame.line > 0 ? frame.line : undefined;
  return { file, line };
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

/**
 * Resolve a GitHub token for API calls. Order: repo owner → first org member with token → PAT.
 */
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

/**
 * Resolve repo for incident: explicit incidentServiceName match → single-repo fallback → null.
 */
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

// --- Scoring and enrichment ---

const RECENCY_WINDOW_HOURS = 168; // 1 week
const MAX_RELATED_COMMITS = 5;

export interface ScoredCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: { login: string; name?: string | null };
  htmlUrl: string;
  timestamp: string;
  score: number;
}

/**
 * Score commits by recency. Phase 1: file match = 1.0, recency = 0.5 * (1 - hours/168).
 */
export function scoreAndRankCommits(
  commits: GitHubCommitForCorrelation[],
  _location: CodeLocation,
  eventTime: string,
  limit: number = MAX_RELATED_COMMITS
): ScoredCommit[] {
  const eventTs = new Date(eventTime).getTime();
  const scored: ScoredCommit[] = commits.map((c) => {
    const commitTs = new Date(c.timestamp).getTime();
    const hoursSince = (eventTs - commitTs) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - hoursSince / RECENCY_WINDOW_HOURS);
    const score = 1.0 + 0.5 * recencyScore;
    return {
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.message,
      author: { login: c.authorLogin, name: c.authorName },
      htmlUrl: c.htmlUrl,
      timestamp: c.timestamp,
      score: Math.round(score * 1000) / 1000,
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
}

function emptyCorrelation(): EnrichedCorrelation {
  return { relatedCommits: [], relevantAuthors: [], correlationSource: null };
}

/**
 * Enrich incident with GitHub-related commits. Never throws; returns empty on any failure.
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
  if (!orgId) { console.warn("[correlation] no orgId"); return emptyCorrelation(); }

  const location = extractBestCodeLocation(summary.stacktrace || []);
  if (!location || !isMappablePath(location.file)) {
    console.warn("[correlation] no mappable location from stacktrace:", summary.stacktrace?.map(f => f.file));
    return emptyCorrelation();
  }
  console.log("[correlation] best location:", location.file, "line:", location.line);

  const repo = await resolveRepoForIncident(summary.service, orgId, storage);
  if (!repo || !repo.token) {
    console.warn("[correlation] no repo resolved for service:", summary.service, "orgId:", orgId);
    return emptyCorrelation();
  }
  console.log("[correlation] resolved repo:", repo.fullName);

  const sinceDate = new Date(summary.start_time);
  sinceDate.setDate(sinceDate.getDate() - 7);
  const since = sinceDate.toISOString();

  const commits = await listCommitsByPath(repo.owner, repo.repo, location.file, since, repo.token);
  if (!commits || commits.length === 0) {
    console.warn("[correlation] no commits found for", location.file, "in", repo.fullName, "since", since);
    return emptyCorrelation();
  }
  console.log("[correlation] found", commits.length, "commits for", location.file);

  const scored = scoreAndRankCommits(commits, location, summary.start_time, MAX_RELATED_COMMITS);
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
  };
}
