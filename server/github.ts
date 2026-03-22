import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Same env loading as index.ts: production/staging load ONLY their env file with override.
const root = path.join(__dirname, '..');
const appEnv = process.env.APP_ENV || '';
if (appEnv === 'production' || appEnv === 'staging') {
  dotenv.config({ path: path.join(root, `.env.${appEnv}`), override: true });
} else {
  dotenv.config({ path: path.join(root, '.env') });
}

interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string | null;
  /** True if the returned email is verified by GitHub (from /user/emails). */
  emailVerified?: boolean;
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  default_branch: string;
  private: boolean;
}

interface GitHubWebhook {
  id: number;
  name: string;
  active: boolean;
  events: string[];
  config: {
    url: string;
    content_type: string;
  };
}

/** Get client ID and redirect URI for GitHub OAuth based on host (for login/init flow). */
export function getGitHubOAuthConfig(requestHost?: string): { clientId: string; redirectUri: string } {
  const host = (requestHost || "").split(":")[0];
  const isProductionHost = host === "pushlog.ai";
  const isStagingHost = host === "staging.pushlog.ai";

  let clientId: string;
  if (isProductionHost) {
    clientId = process.env.GITHUB_OAUTH_CLIENT_ID_PROD || "Ov23li5UgB18JcaZHnxk";
  } else if (isStagingHost) {
    clientId = process.env.GITHUB_OAUTH_CLIENT_ID_STAGING || process.env.GITHUB_OAUTH_CLIENT_ID || "Ov23liXZqMTCvDM4tDHv";
  } else {
    clientId = process.env.GITHUB_OAUTH_CLIENT_ID || "Ov23li5UgB18JcaZHnxk";
  }

  // Prefer request host over APP_URL: when one server hosts both staging and production,
  // APP_URL may be wrong for the current request. The host is what the user actually visited.
  const redirectUri = host
    ? `https://${host}/auth/github/callback`
    : process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/$/, "")}/auth/github/callback`
      : "https://pushlog.ai/auth/github/callback";

  return { clientId, redirectUri };
}

/**
 * Exchange OAuth code for access token.
 * redirect_uri must match the callback URL used in the authorization request (required by GitHub when app has multiple callbacks or in strict mode).
 * When requestHost is set, use host-specific credentials so production (pushlog.ai) uses the production OAuth app even if server env has staging credentials.
 */
export async function exchangeCodeForToken(code: string, redirectUri?: string, requestHost?: string): Promise<string> {
  const host = (requestHost || "").split(":")[0];
  const isProductionHost = host === "pushlog.ai";
  const isStagingHost = host === "staging.pushlog.ai";

  let clientId: string;
  let clientSecret: string | undefined;
  if (isProductionHost) {
    // Production OAuth app only (callback https://pushlog.ai/auth/github/callback). Do not use generic env — server may have staging creds loaded.
    clientId = process.env.GITHUB_OAUTH_CLIENT_ID_PROD || "Ov23li5UgB18JcaZHnxk";
    clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET_PROD || process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
  } else if (isStagingHost) {
    clientId = process.env.GITHUB_OAUTH_CLIENT_ID_STAGING || process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID || "Ov23liXZqMTCvDM4tDHv";
    clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET_STAGING || process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
  } else {
    clientId = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_CLIENT_ID || "Ov23li5UgB18JcaZHnxk";
    clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
  }

  const effectiveRedirectUri =
    redirectUri ||
    (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, "")}/auth/github/callback` : undefined);

  if (!clientId || !clientSecret) {
    console.error("GitHub OAuth configuration error:", {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      oauthClientIdEnv: process.env.GITHUB_OAUTH_CLIENT_ID ? "set" : "missing",
      oauthClientSecretEnv: process.env.GITHUB_OAUTH_CLIENT_SECRET ? "set" : "missing",
      fallbackClientIdEnv: process.env.GITHUB_CLIENT_ID ? "set" : "missing",
      fallbackClientSecretEnv: process.env.GITHUB_CLIENT_SECRET ? "set" : "missing"
    });
    throw new Error("GitHub OAuth credentials not configured. Please check GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET environment variables.");
  }

  const body: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
  };
  if (effectiveRedirectUri) body.redirect_uri = effectiveRedirectUri;

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  
  if (data.error) {
    console.error("GitHub OAuth error from callback:", {
      error: data.error,
      error_description: data.error_description,
      error_uri: data.error_uri
    });
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }

  if (!data.access_token) {
    console.error("GitHub OAuth response missing access_token:", data);
    throw new Error("GitHub OAuth response missing access token");
  }
  
  return data.access_token;
}

/**
 * Get user information from GitHub
 */
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  // First get the user profile
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/vnd.github.v3+json",
    },
  });

  if (!userResponse.ok) {
    throw new Error(`GitHub API error: ${userResponse.statusText}`);
  }

  const userData = await userResponse.json();

  // Then get the user's emails
  const emailResponse = await fetch("https://api.github.com/user/emails", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/vnd.github.v3+json",
    },
  });

  if (!emailResponse.ok) {
    throw new Error(`GitHub API error: ${emailResponse.statusText}`);
  }

  const emails = await emailResponse.json();
  const verifiedEmails = emails.filter((e: any) => e.verified);
  const primaryEmail = emails.find((email: any) => email.primary)?.email || emails[0]?.email;
  const verifiedEmail = verifiedEmails.find((e: any) => e.primary)?.email || verifiedEmails[0]?.email || null;

  return {
    ...userData,
    email: verifiedEmail ?? primaryEmail ?? null,
    emailVerified: !!verifiedEmail,
  };
}

/**
 * Get the scopes for a GitHub access token
 */
export async function getGitHubTokenScopes(accessToken: string): Promise<string[]> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });

    const scopesHeader = response.headers.get("x-oauth-scopes");
    if (scopesHeader) {
      return scopesHeader.split(", ").map(s => s.trim());
    }
    return [];
  } catch (error) {
    console.error('Error getting GitHub token scopes:', error);
    return [];
  }
}

/**
 * Validate if a GitHub access token is still valid
 */
export async function validateGitHubToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });

    return response.ok;
  } catch (error) {
    console.error('GitHub token validation error:', error);
    return false;
  }
}

/**
 * OAuth app client_id + client_secret pairs configured on this server (prod, staging, generic).
 * Used to revoke grants — the pair must match the app that issued the user's token.
 */
function getConfiguredGitHubOAuthAppCredentialPairs(): Array<{ clientId: string; clientSecret: string }> {
  const pairs: Array<{ clientId: string; clientSecret: string }> = [];
  const seen = new Set<string>();
  const push = (id: string | undefined, secret: string | undefined) => {
    const cid = id?.trim();
    const sec = secret?.trim();
    if (!cid || !sec) return;
    const key = `${cid}:${sec}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ clientId: cid, clientSecret: sec });
  };

  push(
    process.env.GITHUB_OAUTH_CLIENT_ID_PROD,
    process.env.GITHUB_OAUTH_CLIENT_SECRET_PROD || process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET
  );
  push(
    process.env.GITHUB_OAUTH_CLIENT_ID_STAGING || process.env.GITHUB_OAUTH_CLIENT_ID,
    process.env.GITHUB_OAUTH_CLIENT_SECRET_STAGING || process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET
  );
  push(process.env.GITHUB_OAUTH_CLIENT_ID, process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET);
  push(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_OAUTH_CLIENT_SECRET);

  return pairs;
}

export type RevokeGitHubGrantResult = {
  revoked: boolean;
  attemptedPairs: number;
  /** HTTP status from the last attempt (e.g. 204 success, 404 wrong app) */
  lastHttpStatus?: number;
};

/**
 * Revoke the OAuth authorization on GitHub so the app disappears from
 * Settings → Applications → Authorized OAuth Apps and the next connect shows full consent.
 * DELETE https://api.github.com/applications/{client_id}/grant — Basic auth = client_id:client_secret.
 * @see https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-authorization
 */
export async function revokeGitHubOAuthGrant(accessToken: string): Promise<RevokeGitHubGrantResult> {
  const pairs = getConfiguredGitHubOAuthAppCredentialPairs();
  if (pairs.length === 0) {
    console.warn("revokeGitHubOAuthGrant: no GITHUB_*_CLIENT_ID/SECRET pairs configured; skipping GitHub-side revoke");
    return { revoked: false, attemptedPairs: 0 };
  }

  let lastHttpStatus: number | undefined;
  for (let i = 0; i < pairs.length; i++) {
    const { clientId, clientSecret } = pairs[i]!;
    const url = `https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`;
    const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${basic}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "PushLog",
        },
        body: JSON.stringify({ access_token: accessToken }),
      });
      lastHttpStatus = response.status;
      if (response.status === 204) {
        return { revoked: true, attemptedPairs: i + 1, lastHttpStatus: 204 };
      }
    } catch (err) {
      console.error("revokeGitHubOAuthGrant fetch error:", err);
    }
  }

  return { revoked: false, attemptedPairs: pairs.length, lastHttpStatus };
}

/**
 * Get user's repositories from GitHub (including organization repos)
 */
export async function getUserRepositories(accessToken: string): Promise<GitHubRepository[]> {
  // Check token scopes first
  const scopes = await getGitHubTokenScopes(accessToken);
  
  const hasRepoScope = scopes.includes("repo");
  if (!hasRepoScope) {
    console.warn("⚠️  WARNING: GitHub token does not have 'repo' scope. Private repos will not be accessible.");
    console.warn("⚠️  User needs to re-authenticate with GitHub to get 'repo' scope.");
  }

  const allRepos: GitHubRepository[] = [];
  let page = 1;
  
  // Fetch all pages of repos with affiliation parameter to include org repos
  // Note: affiliation already includes all repos (public and private) if token has 'repo' scope
  while (true) {
    const response = await fetch(
      `https://api.github.com/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/vnd.github.v3+json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GitHub API error: ${response.status} ${response.statusText}`, errorText);
      
      // If 403 and no repo scope, provide helpful error
      if (response.status === 403 && !hasRepoScope) {
        throw new Error("GitHub token missing 'repo' scope. Please reconnect your GitHub account to grant access to private repositories.");
      }
      
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const repos = await response.json();
    if (repos.length === 0) break;
    
    allRepos.push(...repos);
    if (repos.length < 100) break; // Last page
    page++;
  }
  
  return allRepos;
}

/**
 * List repository webhooks and return the one matching webhookUrl if it exists.
 * Uses OAuth token; falls back to PAT if provided.
 */
export async function findExistingWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  webhookUrl: string
): Promise<GitHubWebhook | null> {
  const tryFetch = async (token: string): Promise<GitHubWebhook | null> => {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });
    if (!response.ok) return null;
    const hooks: GitHubWebhook[] = await response.json();
    const normalizedOur = webhookUrl.replace(/\/$/, "");
    const found = hooks.find((h) => (h.config?.url || "").replace(/\/$/, "") === normalizedOur);
    return found ?? null;
  };
  const existing = await tryFetch(accessToken);
  if (existing) return existing;
  const pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (pat) return tryFetch(pat);
  return null;
}

/**
 * Create a webhook for a repository using OAuth token or fallback to PAT
 */
export async function createWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  webhookUrl: string
): Promise<GitHubWebhook> {
  const webhookSecret = (process.env.GITHUB_WEBHOOK_SECRET || "").trim();
  const config: { url: string; content_type: string; secret?: string } = {
    url: webhookUrl,
    content_type: "json",
  };
  if (webhookSecret) {
    config.secret = webhookSecret;
  }

  const pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push"],
        config,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorsDetail = Array.isArray((error as any).errors) ? (error as any).errors.map((e: any) => e.message || e.field || JSON.stringify(e)).join("; ") : "";
      const message = (error as any).message || (error as any).error || response.statusText;
      console.error('GitHub webhook creation error with OAuth token:', {
        status: response.status,
        statusText: response.statusText,
        error: error,
        owner,
        repo,
        webhookUrl
      });
      throw new Error(`Failed to create webhook: ${message}${errorsDetail ? ` (${errorsDetail})` : ""}`);
    }

    return await response.json();
  } catch (oauthError) {
    // If OAuth fails, try with PAT if available
    const pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (pat) {
      try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${pat}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "web",
            active: true,
            events: ["push"],
            config,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const errorsDetail = Array.isArray((error as any).errors) ? (error as any).errors.map((e: any) => e.message || e.field || JSON.stringify(e)).join("; ") : "";
          const message = (error as any).message || (error as any).error || response.statusText;
          console.error('GitHub webhook creation error with PAT:', {
            status: response.status,
            statusText: response.statusText,
            error: error,
            owner,
            repo,
            webhookUrl
          });
          throw new Error(`Failed to create webhook with PAT: ${message}${errorsDetail ? ` (${errorsDetail})` : ""}`);
        }

        return await response.json();
      } catch (patError) {
        console.error('Both OAuth and PAT webhook creation failed:', { oauthError, patError });
        throw oauthError; // Throw the original OAuth error
      }
    } else {
      throw oauthError; // No PAT available, throw original error
    }
  }
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  webhookId: string
): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/vnd.github.v3+json",
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete webhook: ${response.statusText}`);
  }
}

/**
 * Minimal commit shape returned by listCommitsByPath for incident correlation.
 */
export interface GitHubCommitForCorrelation {
  sha: string;
  message: string;
  authorLogin: string;
  authorName: string | null;
  timestamp: string;
  htmlUrl: string;
}

const GITHUB_COMMITS_FETCH_TIMEOUT_MS = 4000;
const GITHUB_CONTENTS_FETCH_TIMEOUT_MS = 4000;

/** Encode each path segment for GET .../contents/{path} (GitHub requires per-segment encoding). */
function encodeRepoContentPath(filePath: string): string {
  const trimmed = String(filePath || "").replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/**
 * Fetch the raw text of line `lineNumber` (1-based) from a file at `ref` (branch, tag, or commit SHA).
 * Uses the repository contents API with raw media type so large files are supported without base64.
 * Returns null if the path is missing, the ref is invalid, the line is out of range, or the request fails.
 */
export async function getExactSourceLine(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  lineNumber: number,
  accessToken?: string | null
): Promise<string | null> {
  const token = (accessToken && accessToken.trim()) || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "";
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const p = String(path || "").trim();
  const rf = String(ref || "").trim();
  const line = Math.trunc(Number(lineNumber));
  if (!o || !r || !p || !rf || !Number.isFinite(line) || line < 1) return null;

  const encodedPath = encodeRepoContentPath(p);
  if (!encodedPath) return null;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3.raw",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/contents/${encodedPath}`
  );
  url.searchParams.set("ref", rf);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GITHUB_CONTENTS_FETCH_TIMEOUT_MS);
    const response = await fetch(url.toString(), {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 403) {
        console.warn("[github] getExactSourceLine forbidden:", response.status, o, r, p);
      }
      return null;
    }

    const ct = (response.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return null;

    const text = await response.text();
    const lines = text.split(/\r?\n/);
    if (line > lines.length) return null;
    return lines[line - 1] ?? null;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn("[github] getExactSourceLine timeout:", o, r, p);
    } else {
      console.warn("[github] getExactSourceLine error:", err?.message || err, o, r);
    }
    return null;
  }
}

/**
 * Default branch name for a repository (e.g. `main`). Used when choosing a ref for contents/blame-aligned reads.
 */
export async function getRepositoryDefaultBranchName(
  owner: string,
  repo: string,
  accessToken?: string | null
): Promise<string | null> {
  const token = (accessToken && accessToken.trim()) || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "";
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  if (!o || !r) return null;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GITHUB_CONTENTS_FETCH_TIMEOUT_MS);
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`,
      { headers, signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = (await response.json()) as { default_branch?: string };
    const br = data.default_branch;
    return typeof br === "string" && br.trim() ? br.trim() : null;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn("[github] getRepositoryDefaultBranchName timeout:", o, r);
    } else {
      console.warn("[github] getRepositoryDefaultBranchName error:", err?.message || err, o, r);
    }
    return null;
  }
}

/**
 * List commits that touch a specific file path.
 * Used for incident-to-code correlation. Returns [] on any error (404, 403, 500, timeout).
 * @param owner - repo owner
 * @param repo - repo name (no .git)
 * @param filePath - path within repo (e.g. "src/handler.ts")
 * @param since - ISO8601 date; only commits after this time
 * @param accessToken - required for private repos; uses GITHUB_PERSONAL_ACCESS_TOKEN if not provided
 * @returns Up to 20 commits, or [] on failure
 */
export async function listCommitsByPath(
  owner: string,
  repo: string,
  filePath: string,
  since: string,
  accessToken?: string | null
): Promise<GitHubCommitForCorrelation[]> {
  const token = (accessToken && accessToken.trim()) || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits`);
  url.searchParams.set("path", filePath);
  url.searchParams.set("since", since);
  url.searchParams.set("per_page", "20");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GITHUB_COMMITS_FETCH_TIMEOUT_MS);
    const response = await fetch(url.toString(), {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 403) {
        console.warn("[github] listCommitsByPath rate limit or forbidden:", response.status, owner, repo);
      } else if (response.status >= 500) {
        console.warn("[github] listCommitsByPath server error:", response.status, owner, repo);
      }
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((c: any) => {
      const commit = c.commit || {};
      const author = commit.author || {};
      const user = c.author || {};
      return {
        sha: String(c.sha || ""),
        message: String(commit.message || "")
          .split("\n")[0]
          .trim()
          .slice(0, 120),
        authorLogin: user?.login || author?.email || "unknown",
        authorName: author?.name ? String(author.name) : null,
        timestamp: String(author?.date || ""),
        htmlUrl: c.html_url || `https://github.com/${owner}/${repo}/commit/${c.sha}`,
      };
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn("[github] listCommitsByPath timeout:", owner, repo, filePath);
    } else {
      console.warn("[github] listCommitsByPath error:", err?.message || err, owner, repo);
    }
    return [];
  }
}

const GITHUB_GRAPHQL_TIMEOUT_MS = 4000;

/** Commit that last modified a line on the default branch (Git blame). */
export interface GitHubBlameCommit {
  sha: string;
  message: string;
  authorLogin: string;
  authorName: string | null;
  timestamp: string;
  htmlUrl: string;
}

/**
 * Resolve which commit last touched `line` in `filePath` on the repository default branch.
 * Uses the GraphQL blame API so line numbers match the current tree (unlike unified-diff line math across history).
 */
export async function fetchBlameCommitForLine(
  owner: string,
  repo: string,
  filePath: string,
  line: number,
  accessToken?: string | null
): Promise<GitHubBlameCommit | null> {
  const token = (accessToken && accessToken.trim()) || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "";
  if (!token || !filePath || line < 1) return null;

  const query = `
    query BlameLine($owner: String!, $name: String!, $path: String!) {
      repository(owner: $owner, name: $name) {
        defaultBranchRef {
          target {
            ... on Commit {
              blame(path: $path) {
                ranges {
                  startingLine
                  endingLine
                  commit {
                    oid
                    abbreviatedOid
                    message
                    committedDate
                    url
                    author {
                      name
                      email
                      user { login }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GITHUB_GRAPHQL_TIMEOUT_MS);
    const resp = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { owner, name: repo, path: filePath },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      errors?: unknown[];
      data?: {
        repository?: {
          defaultBranchRef?: {
            target?: {
              blame?: {
                ranges?: Array<{
                  startingLine: number;
                  endingLine: number;
                  commit?: {
                    oid?: string;
                    abbreviatedOid?: string;
                    message?: string;
                    committedDate?: string;
                    url?: string;
                    author?: { name?: string | null; email?: string | null; user?: { login?: string } | null };
                  };
                }>;
              };
            };
          };
        };
      };
    };

    if (json.errors?.length) {
      console.warn("[github] fetchBlameCommitForLine GraphQL errors:", owner, repo, filePath);
      return null;
    }

    const ranges = json.data?.repository?.defaultBranchRef?.target?.blame?.ranges;
    if (!Array.isArray(ranges) || ranges.length === 0) return null;

    const hit = ranges.find((r) => line >= r.startingLine && line <= r.endingLine);
    if (!hit?.commit?.oid) return null;

    const c = hit.commit;
    const msg = String(c.message || "")
      .split("\n")[0]
      .trim()
      .slice(0, 120);
    const author = c.author;
    const login =
      author?.user?.login?.trim() ||
      (author?.email && String(author.email).includes("@") ? String(author.email).split("@")[0] : "") ||
      "unknown";

    return {
      sha: String(c.oid),
      message: msg,
      authorLogin: login,
      authorName: author?.name ? String(author.name) : null,
      timestamp: String(c.committedDate || ""),
      htmlUrl: c.url || `https://github.com/${owner}/${repo}/commit/${c.oid}`,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn("[github] fetchBlameCommitForLine timeout:", owner, repo, filePath);
    } else {
      console.warn("[github] fetchBlameCommitForLine error:", err?.message || err, owner, repo);
    }
    return null;
  }
}

/**
 * Get a single commit (includes stats: additions, deletions).
 * Use for push webhooks since the push payload does not include line counts.
 * @param owner - repo owner
 * @param repo - repo name (no .git)
 * @param ref - commit SHA, branch name, or tag
 * @param accessToken - optional; uses GITHUB_PERSONAL_ACCESS_TOKEN if not provided
 */
export async function getCommit(
  owner: string,
  repo: string,
  ref: string,
  accessToken?: string | null
): Promise<{ additions: number; deletions: number } | null> {
  const token = (accessToken && accessToken.trim()) || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`,
      { headers }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const additions = data.stats?.additions ?? 0;
    const deletions = data.stats?.deletions ?? 0;
    return { additions, deletions };
  } catch {
    return null;
  }
}

/** GitHub org (from GET /user/orgs). Requires read:org scope. */
export interface GitHubOrg {
  login: string;
  id: number;
  avatar_url: string | null;
  description: string | null;
}

/** GitHub org member (from GET /orgs/:org/members). Minimal fields. */
export interface GitHubOrgMember {
  login: string;
  id: number;
  avatar_url: string | null;
}

export interface GitHubOrgMembership {
  state: string;
  role: string | null;
  organization: GitHubOrg;
}

/**
 * Get a GitHub user's public profile email (GET /users/:username).
 * Returns email only if the user has made it public on their GitHub profile; otherwise null.
 * Tries both email and notification_email; uses recommended Accept header for best compatibility.
 */
export async function getGitHubUserPublicEmail(accessToken: string, login: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string | null; notification_email?: string | null };
  const email =
    (typeof data?.email === "string" && data.email.trim() ? data.email.trim() : null) ||
    (typeof data?.notification_email === "string" && data.notification_email.trim() ? data.notification_email.trim() : null);
  return email || null;
}

/**
 * List organizations the authenticated user is a member of.
 * Requires GitHub OAuth scope: read:org.
 */
export async function getGitHubUserOrgs(accessToken: string): Promise<GitHubOrg[]> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  } as const;

  const byId = new Map<number, GitHubOrg>();

  // Primary list endpoint.
  let page = 1;
  while (true) {
    const response = await fetch(`https://api.github.com/user/orgs?per_page=100&page=${page}`, { headers });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = (err as any).message || response.statusText;
      if (response.status === 403) {
        throw new Error(`GitHub API: ${msg}. PushLog requests read:org when you connect GitHub—disconnect and reconnect GitHub in Settings to grant organization access.`);
      }
      throw new Error(`GitHub API error: ${msg}`);
    }
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const org of data as any[]) {
      if (typeof org?.id === "number" && typeof org?.login === "string") {
        byId.set(org.id, {
          id: org.id,
          login: org.login,
          avatar_url: org.avatar_url ?? null,
          description: org.description ?? null,
        });
      }
    }
    if (data.length < 100) break;
    page++;
  }

  // Membership endpoint can surface org memberships that /user/orgs can miss.
  // Do not restrict to `state=active` so we can also surface `pending` memberships.
  page = 1;
  while (true) {
    const response = await fetch(`https://api.github.com/user/memberships/orgs?per_page=100&page=${page}`, { headers });
    if (!response.ok) {
      // Best-effort fallback only; don't fail if this endpoint is unavailable.
      break;
    }
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const membership of data as any[]) {
      const org = membership?.organization;
      if (typeof org?.id === "number" && typeof org?.login === "string") {
        byId.set(org.id, {
          id: org.id,
          login: org.login,
          avatar_url: org.avatar_url ?? null,
          description: org.description ?? null,
        });
      }
    }
    if (data.length < 100) break;
    page++;
  }

  return Array.from(byId.values()).sort((a, b) => a.login.localeCompare(b.login));
}

/** Raw diagnostics for debugging org visibility in OAuth flows. */
export async function getGitHubOrgDiagnostics(accessToken: string): Promise<{
  scopes: string[];
  userOrgs: GitHubOrg[];
  memberships: GitHubOrgMembership[];
}> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  } as const;

  const scopes = await getGitHubTokenScopes(accessToken);

  const userOrgs: GitHubOrg[] = [];
  let page = 1;
  while (true) {
    const response = await fetch(`https://api.github.com/user/orgs?per_page=100&page=${page}`, { headers });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = (err as any).message || response.statusText;
      throw new Error(`GitHub /user/orgs failed: ${msg}`);
    }
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const org of data as any[]) {
      if (typeof org?.id === "number" && typeof org?.login === "string") {
        userOrgs.push({
          id: org.id,
          login: org.login,
          avatar_url: org.avatar_url ?? null,
          description: org.description ?? null,
        });
      }
    }
    if (data.length < 100) break;
    page++;
  }

  const memberships: GitHubOrgMembership[] = [];
  page = 1;
  while (true) {
    const response = await fetch(`https://api.github.com/user/memberships/orgs?per_page=100&page=${page}`, { headers });
    if (!response.ok) break;
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const membership of data as any[]) {
      const org = membership?.organization;
      if (typeof org?.id === "number" && typeof org?.login === "string") {
        memberships.push({
          state: typeof membership?.state === "string" ? membership.state : "unknown",
          role: typeof membership?.role === "string" ? membership.role : null,
          organization: {
            id: org.id,
            login: org.login,
            avatar_url: org.avatar_url ?? null,
            description: org.description ?? null,
          },
        });
      }
    }
    if (data.length < 100) break;
    page++;
  }

  return { scopes, userOrgs, memberships };
}

/**
 * List members of a GitHub organization.
 * Requires GitHub OAuth scope: read:org.
 * Paginated; returns all members.
 */
export async function getGitHubOrgMembers(accessToken: string, orgLogin: string): Promise<GitHubOrgMember[]> {
  const org = encodeURIComponent(orgLogin);
  const allMembers: GitHubOrgMember[] = [];
  let page = 1;
  while (true) {
    const response = await fetch(
      `https://api.github.com/orgs/${org}/members?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = (err as any).message || response.statusText;
      if (response.status === 403) {
        throw new Error(`GitHub API: ${msg}. PushLog requests read:org when you connect GitHub—disconnect and reconnect in Settings if needed.`);
      }
      if (response.status === 404) {
        throw new Error("GitHub organization not found or you do not have access.");
      }
      throw new Error(`GitHub API error: ${msg}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) return allMembers;
    if (data.length === 0) break;
    allMembers.push(...data.map((m: any) => ({ login: m.login, id: m.id, avatar_url: m.avatar_url ?? null })));
    if (data.length < 100) break;
    page++;
  }
  return allMembers;
}

/**
 * Verify webhook signature using the raw body buffer and exact header value.
 * GitHub sends X-Hub-Signature-256: sha256=<hex> (HMAC-SHA256 of the raw request body).
 * No mutation of secret; payload must be the exact Buffer received.
 */
export function verifyWebhookSignature(payload: Buffer, signature: string, secret: string): boolean {
  if (!payload || !Buffer.isBuffer(payload)) return false;
  if (!secret || typeof secret !== "string") return false;
  const sig = signature != null ? String(signature).trim() : "";
  if (!sig || !sig.startsWith("sha256=")) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
