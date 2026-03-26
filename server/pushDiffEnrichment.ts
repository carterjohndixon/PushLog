/**
 * Cost-controlled, high-signal diff excerpts for AI push summaries.
 * Uses GitHub commit file patches (when present), filters noise, and enforces strict size limits.
 */

// PushLog self-test: after pushing, Slack summary should mention this line if diff enrichment is working.

import { databaseStorage } from "./database";
import { getCommitDetail, type GitHubCommitDetail, type GitHubCommitFilePatch } from "./github";
import type { CompactDiffFile, DiffContext, PushEventData } from "./ai";

type PushDataWithInternal = PushEventData & {
  /** Set by buildPushData when the API returned full commit details (avoids a second HTTP request). */
  _githubCommitDetail?: GitHubCommitDetail | null;
};

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envBool(name: string, defaultTrue: boolean): boolean {
  const v = process.env[name];
  if (v == null || v === "") return defaultTrue;
  return !/^(0|false|no|off)$/i.test(v.trim());
}

/** Limits configurable via env (see inline defaults). */
export function readDiffEnrichmentLimits() {
  return {
    enabled: envBool("PUSHLOG_DIFF_ENABLE", true),
    maxFiles: envInt("PUSHLOG_DIFF_MAX_FILES", 5),
    maxLinesPerFile: envInt("PUSHLOG_DIFF_MAX_LINES_PER_FILE", 80),
    maxCharsPerFile: envInt("PUSHLOG_DIFF_MAX_CHARS_PER_FILE", 4000),
    maxTotalChars: envInt("PUSHLOG_DIFF_MAX_TOTAL_CHARS", 12_000),
    /** Skip API + diff work when total changed lines (add+del) is below this (metadata-only is enough). */
    minCommitLines: envInt("PUSHLOG_DIFF_MIN_COMMIT_LINES", 0),
    /** Skip when the commit is enormous (avoid huge payloads and token spikes). */
    maxCommitLines: envInt("PUSHLOG_DIFF_MAX_COMMIT_LINES", 80_000),
    /** Max @@ hunk headers to keep per file (helps orientation without dumping context). */
    maxHunkHeadersPerFile: envInt("PUSHLOG_DIFF_MAX_HUNK_HEADERS", 3),
  };
}

const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
]);

/** Paths that are almost never worth reading as diff excerpts for summaries. */
function isNoisePath(filename: string): boolean {
  const f = filename.replace(/\\/g, "/").trim();
  if (!f) return true;
  const lower = f.toLowerCase();
  const base = lower.split("/").pop() ?? lower;

  if (LOCKFILE_NAMES.has(base)) return true;
  if (lower.includes("node_modules/")) return true;
  if (lower.startsWith("dist/") || lower.includes("/dist/")) return true;
  if (lower.startsWith("build/") || lower.includes("/build/")) return true;
  if (lower.startsWith(".next/") || lower.includes("/.next/")) return true;
  if (lower.startsWith("coverage/") || lower.includes("/coverage/")) return true;
  if (lower.includes("vendor/") || lower.startsWith("vendor/")) return true;
  if (lower.endsWith(".min.js") || lower.endsWith(".min.css")) return true;
  if (lower.endsWith(".map") && lower.endsWith(".js.map")) return true;
  if (lower.endsWith(".snap") || lower.includes("__snapshots__/")) return true;
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".gif") || lower.endsWith(".webp")) return true;
  if (lower.endsWith(".ico") || lower.endsWith(".woff") || lower.endsWith(".woff2")) return true;
  if (lower.endsWith(".pdf") || lower.endsWith(".zip") || lower.endsWith(".tar")) return true;

  return false;
}

/** Prefer infra, app source, CI; de-prioritize docs and lockfiles (handled separately). */
function relevanceScore(filename: string, additions: number, deletions: number): number {
  const f = filename.replace(/\\/g, "/");
  const lower = f.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  const depth = f.split("/").length;
  let score = Math.min(additions + deletions, 800);

  const infra =
    /^(dockerfile|docker-compose\.ya?ml|compose\.ya?ml|\.dockerignore)$/.test(base) ||
    /^\.env(\.[a-z0-9_-]+)?$/i.test(base) ||
    base === "package.json" ||
    base === "tsconfig.json" ||
    base === "vite.config.ts" ||
    base === "vite.config.mts" ||
    /^\.github\/workflows\//.test(lower) ||
    lower.startsWith(".github/") ||
    base === "Makefile" ||
    base === "turbo.json" ||
    base === "nixpacks.toml";

  if (infra) score += 220;

  const srcRoots = ["src/", "server/", "client/", "app/", "agent/", "lib/", "packages/"];
  if (srcRoots.some((p) => lower.startsWith(p) || lower.includes(`/${p}`))) score += 120;

  if (lower.startsWith("docs/") || lower.endsWith(".md")) score -= 70;
  if (lower.startsWith("test/") || lower.startsWith("tests/") || lower.includes("/__tests__/")) score -= 5;

  // Slight preference for shallow paths (often entry points)
  if (depth <= 2) score += 10;

  return score;
}

/**
 * Extract + / - lines and a few @@ headers from a unified diff patch; drop context and file headers.
 */
export function extractCompactLinesFromPatch(
  patch: string,
  maxLines: number,
  maxChars: number,
  maxHunkHeaders: number
): string[] {
  const lines = patch.split(/\r?\n/);
  const out: string[] = [];
  let charBudget = maxChars;
  let hunkHeaders = 0;

  for (const line of lines) {
    if (out.length >= maxLines) break;
    if (line.length === 0) continue;

    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("diff --git")) continue;
    if (line.startsWith("\\")) continue; // "\ No newline at end of file"

    if (line.startsWith("@@")) {
      if (hunkHeaders >= maxHunkHeaders) continue;
      if (charBudget < line.length + 1) break;
      hunkHeaders++;
      charBudget -= line.length + 1;
      out.push(line);
      continue;
    }

    const c0 = line[0];
    if (c0 === " ") continue; // context
    if (c0 !== "+" && c0 !== "-") continue;

    if (line.startsWith("+++") || line.startsWith("---")) continue;

    const take = line.length + 1;
    if (charBudget < take) break;
    charBudget -= take;
    out.push(line);
  }

  return out;
}

function sortFilesForEnrichment(files: GitHubCommitFilePatch[]): GitHubCommitFilePatch[] {
  const scored = files
    .filter((f) => f.filename && !isNoisePath(f.filename))
    .map((f) => ({
      f,
      score: relevanceScore(f.filename, f.additions, f.deletions),
    }))
    .filter((x) => x.score > -1e6);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const bt = b.f.additions + b.f.deletions;
    const at = a.f.additions + a.f.deletions;
    return bt - at;
  });

  return scored.map((x) => x.f);
}

export async function resolveGitHubTokenForApi(integrationUserId: string): Promise<string | null> {
  let token: string | null = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || null;
  if (token?.trim()) return token.trim();
  try {
    const user = await databaseStorage.getUserById(integrationUserId);
    const raw = (user as { githubToken?: string | null } | null)?.githubToken;
    return raw && typeof raw === "string" && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Builds a compact diff context and assigns `pushData.diffContext`.
 * Mutates `pushData`; clears internal `_githubCommitDetail` when done.
 */
export async function attachCompactDiffContextToPushData(
  pushData: PushDataWithInternal,
  opts: {
    repositoryFullName: string;
    commitSha: string;
    integrationUserId: string;
  }
): Promise<void> {
  const limits = readDiffEnrichmentLimits();
  const emptyReason = (reason: string): DiffContext => ({
    used: false,
    reason,
    totalFilesConsidered: 0,
    totalFilesIncluded: 0,
    totalCharsIncluded: 0,
    files: [],
  });

  try {
    if (!limits.enabled) {
      pushData.diffContext = emptyReason("disabled");
      delete pushData._githubCommitDetail;
      return;
    }

    const totalLines = (pushData.additions ?? 0) + (pushData.deletions ?? 0);
    if (limits.minCommitLines > 0 && totalLines < limits.minCommitLines) {
      pushData.diffContext = emptyReason("tiny_commit");
      delete pushData._githubCommitDetail;
      return;
    }
    if (totalLines > limits.maxCommitLines) {
      pushData.diffContext = emptyReason("huge_commit");
      delete pushData._githubCommitDetail;
      return;
    }

    const token = await resolveGitHubTokenForApi(opts.integrationUserId);
    if (!token) {
      pushData.diffContext = emptyReason("no_github_token");
      delete pushData._githubCommitDetail;
      return;
    }

    const repoFull = opts.repositoryFullName.trim();
    const sha = opts.commitSha.trim();
    if (!repoFull.includes("/") || !sha || sha === "unknown") {
      pushData.diffContext = emptyReason("invalid_repo_or_sha");
      delete pushData._githubCommitDetail;
      return;
    }

    let detail: GitHubCommitDetail | null = pushData._githubCommitDetail ?? null;
    delete pushData._githubCommitDetail;

    if (!detail) {
      const [owner, ...rest] = repoFull.split("/");
      const repo = rest.join("/");
      if (!owner || !repo) {
        pushData.diffContext = emptyReason("invalid_repo_or_sha");
        return;
      }
      try {
        detail = await getCommitDetail(owner, repo, sha, token);
      } catch {
        detail = null;
      }
    }

    if (!detail || !Array.isArray(detail.files)) {
      pushData.diffContext = emptyReason("github_api_failed_or_empty");
      return;
    }

    const candidates = detail.files.filter((f) => f.filename);
    const withPatch = candidates.filter((f) => typeof f.patch === "string" && f.patch.length > 0);
    if (withPatch.length === 0) {
      pushData.diffContext = {
        used: false,
        reason: "no_patches_in_response",
        totalFilesConsidered: candidates.length,
        totalFilesIncluded: 0,
        totalCharsIncluded: 0,
        files: [],
      };
      return;
    }

    const ordered = sortFilesForEnrichment(withPatch);
    const picked = ordered.slice(0, limits.maxFiles);

    const filesOut: CompactDiffFile[] = [];
    let totalChars = 0;

    for (const f of picked) {
      if (totalChars >= limits.maxTotalChars) break;
      const patch = f.patch!;
      const lines = extractCompactLinesFromPatch(
        patch,
        limits.maxLinesPerFile,
        limits.maxCharsPerFile,
        limits.maxHunkHeadersPerFile
      );
      const joined = lines.join("\n");
      const capped = joined.slice(0, limits.maxCharsPerFile);
      const chunkChars = capped.length;
      if (chunkChars === 0) continue;
      if (totalChars + chunkChars > limits.maxTotalChars) {
        const room = limits.maxTotalChars - totalChars;
        if (room < 80) break;
        const truncated = capped.slice(0, room);
        filesOut.push({
          filename: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          excerpts: truncated.length > 0 ? [truncated] : [],
        });
        totalChars += truncated.length;
        break;
      }
      filesOut.push({
        filename: f.filename,
        additions: f.additions,
        deletions: f.deletions,
        excerpts: capped.length > 0 ? [capped] : [],
      });
      totalChars += chunkChars;
    }

    if (filesOut.length === 0) {
      pushData.diffContext = {
        used: false,
        reason: "no_excerpts_after_filters",
        totalFilesConsidered: candidates.length,
        totalFilesIncluded: 0,
        totalCharsIncluded: 0,
        files: [],
      };
      return;
    }

    pushData.diffContext = {
      used: true,
      reason: "ok",
      totalFilesConsidered: candidates.length,
      totalFilesIncluded: filesOut.length,
      totalCharsIncluded: totalChars,
      files: filesOut,
    };
  } finally {
    const d = pushData.diffContext;
    if (d) {
      console.log(
        `[PushLog] diff enrichment: used=${d.used} reason=${d.reason ?? "n/a"} files=${d.totalFilesIncluded}/${d.totalFilesConsidered} chars=${d.totalCharsIncluded}`
      );
    }
  }
}
