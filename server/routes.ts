import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { authenticateToken, requireEmailVerification, requireMfaPendingSession, getSessionUserWithOrg } from './middleware/auth';
import { requireOrgMember, requireOrgRole } from './middleware/orgAuth';
import {
  isProductionDeployConfigured,
  requestProductionPromote,
  requestProductionCancel,
  getProductionPromotionStatus,
} from './productionDeployClient';
import { 
  exchangeCodeForToken, 
  getGitHubOAuthConfig,
  getGitHubUser, 
  getUserRepositories, 
  createWebhook,
  deleteWebhook,
  validateGitHubToken,
  getGitHubTokenScopes
} from "./github";
import { exchangeGoogleCodeForToken, getGoogleUser } from "./google";
import { 
  sendPushNotification, 
  sendIntegrationWelcomeMessage,
  sendSlackMessage,
  generateSlackOAuthUrl,
  exchangeSlackCodeForToken,
  getSlackChannelsForWorkspace
} from "./slack";
import { insertIntegrationSchema, insertRepositorySchema } from "@shared/schema";
import { z } from "zod";
import { databaseStorage } from "./database";
import { sendVerificationEmail, sendPasswordResetEmail, sendIncidentAlertEmail, sendOrgInviteEmail } from './email';
import { generateCodeSummary, generateSlackMessage } from './ai';
import { createStripeCustomer, createPaymentIntent, stripe, CREDIT_PACKAGES, isBillingEnabled } from './stripe';
import { estimateTokenCostFromUsage } from './aiCost';
import { encrypt, decrypt } from './encryption';
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { body, validationResult } from "express-validator";
import { verifySlackRequest, parseSlackCommandBody, handleSlackCommand } from './slack-commands';
import { getSlackConnectedPopupHtml, getSlackErrorPopupHtml } from './templates/slack-popups';
import broadcastNotification from "./helper/broadcastNotification";
import { resolveToSource } from "./helper/sourceMapResolve";
import { handleGitHubWebhook, scheduleDelayedCostUpdate } from "./githubWebhook";
import { handleSentryWebhook, getIncidentNotificationTargets, wasRecentSentryNotification } from "./sentryWebhook";
import {
  ingestIncidentEvent,
  onIncidentSummary,
  getIncidentEngineStatus,
  type IncidentEventInput,
  type IncidentSummaryOutput,
} from "./incidentEngine";
import * as Sentry from "@sentry/node";

/** Strip sensitive integration fields and add hasOpenRouterKey for API responses */
function sanitizeIntegrationForClient(integration: any) {
  if (!integration) return integration;
  const { openRouterApiKey, ...rest } = integration;
  return { ...rest, hasOpenRouterKey: !!openRouterApiKey };
}

/** True only if the string looks like a real OpenRouter API key (decrypt can return ciphertext on failure). */
function looksLikeOpenRouterKey(s: string | null | undefined): boolean {
  return !!s?.trim().startsWith("sk-or-");
}

/** Turn model id into display prefix for stripping from link text (e.g. gpt-5.2-pro -> "GPT-5.2 pro"). */
function openAiIdToTitle(id: string): string {
  const parts = id.split("-").filter(Boolean);
  if (parts.length === 0) return id;
  const first = parts[0].toLowerCase();
  const rest = parts.slice(1);
  const head = first === "gpt" ? "GPT" : first === "o" && rest[0] ? "o" + rest[0] : parts[0];
  if (rest.length === 0) return head;
  const tail = rest.length === 1 ? rest[0] : rest.slice(1).map((p) => (/\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join(" ");
  return `${head}-${rest[0]}${rest.length > 1 ? " " + tail : ""}`.trim();
}

/** Parse OpenAI docs/models page: extract model id, description, and category (from section heading) from links. */
function parseOpenAiModelsDocPage(html: string): Array<{ id: string; name: string; description?: string; category?: string }> {
  const out: Array<{ id: string; name: string; description?: string; category?: string }> = [];
  const headingRe = /<h[23][^>]*>([^<]+)<\/h[23]>/gi;
  const linkRe = /<a\s+href="(?:https?:\/\/[^"]*)?\/models\/([^"#?]+)(?:[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const headings: { index: number; text: string }[] = [];
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(html)) !== null) {
    const text = hm[1].replace(/\s+/g, " ").trim();
    if (text.length > 0 && text.length < 80) headings.push({ index: hm.index, text });
  }
  const getSectionBefore = (index: number): string | undefined => {
    let last: string | undefined;
    for (const h of headings) {
      if (h.index >= index) break;
      last = h.text;
    }
    return last;
  };
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  linkRe.lastIndex = 0;
  while ((m = linkRe.exec(html)) !== null) {
    const id = m[1].trim().toLowerCase();
    let linkText = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!linkText || !/^(gpt-|o\d|sora|gpt-image|chatgpt|whisper|tts|dall·e|omni|computer-use)/i.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const titlePrefix = openAiIdToTitle(id);
    let description = linkText
      .replace(new RegExp(`^\\s*${titlePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
      .replace(/^\s*New\s*/i, "")
      .trim();
    if (!description) description = linkText.slice(0, 200);
    const category = getSectionBefore(m.index);
    const entry: { id: string; name: string; description?: string; category?: string } = { id, name: id };
    if (description.length > 10) entry.description = description.slice(0, 400);
    if (category) entry.category = category;
    out.push(entry);
  }
  return out;
}

/** Parse OpenAI pricing page HTML to extract model id, description, and per-1M-token prices. */
function parseOpenAiPricingPage(html: string): Array<{ id: string; name: string; description?: string; promptPer1M?: number; completionPer1M?: number }> {
  const details: Array<{ id: string; name: string; description?: string; promptPer1M?: number; completionPer1M?: number }> = [];
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedId = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/\./g, ".");
  const sectionRe = /(?:^|\s)(?:##\s*)?(GPT[- ]?\d+(?:\.\d+)?(?:\s*[- ]?\w+)?|o\d+(?:[- ]?\w+)?|gpt-[\w.-]+)(?:\s|$)/gi;
  let match: RegExpExecArray | null;
  const sections: { name: string; start: number }[] = [];
  while ((match = sectionRe.exec(text)) !== null) {
    const name = match[1].replace(/\s+/g, " ").trim();
    if (/^(gpt-|o\d+)/i.test(name) && !sections.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      sections.push({ name, start: match.index });
    }
  }
  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].start;
    const end = i + 1 < sections.length ? sections[i + 1].start : text.length;
    const block = text.slice(start, end);
    const name = sections[i].name;
    const id = normalizedId(name);
    if (/^(gpt-|o\d+)/i.test(id) === false) continue;
    let description: string | undefined;
    const descMatch = block.match(/\s([A-Z][^$]*?)(?=\s*(?:###|Price|Input:|Output:|\$|\d+\s*\/\s*1M))/);
    if (descMatch) {
      const raw = descMatch[1].trim();
      if (raw.length > 15 && !/^\d|price|input|output|\$|\/\s*1M/i.test(raw)) {
        description = raw.slice(0, 300);
      }
    }
    const inputMatch = block.match(/input\s*:\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
    const outputMatch = block.match(/output\s*:\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
    const promptPer1M = inputMatch ? parseFloat(inputMatch[1].replace(/,/g, "")) : undefined;
    const completionPer1M = outputMatch ? parseFloat(outputMatch[1].replace(/,/g, "")) : undefined;
    if (promptPer1M != null || completionPer1M != null || description) {
      details.push({
        id: id.replace(/\s/g, "-"),
        name,
        ...(description && { description }),
        ...(promptPer1M != null && { promptPer1M }),
        ...(completionPer1M != null && { completionPer1M }),
      });
    }
  }
  // Markdown-style table: | model | input | output |
  const tableRowRe = /\|\s*(gpt-[\w.-]+|o\d+[-.\w]*)\s*\|\s*\$?([\d.]+)\s*\|\s*\$?([\d.]+|-)\s*\|/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = tableRowRe.exec(html)) !== null) {
    const id = rowMatch[1].trim().toLowerCase();
    const input = parseFloat(rowMatch[2]);
    const output = rowMatch[3].trim() === "-" ? undefined : parseFloat(rowMatch[3]);
    if (!details.some((d) => d.id === id)) {
      details.push({
        id,
        name: id,
        promptPer1M: input,
        ...(output != null && { completionPer1M: output }),
      });
    }
  }
  // developers.openai.com: HTML table with Model, Input, Cached Input, Output columns
  const htmlTableRowRe = /<tr[^>]*>[\s\S]*?<td[^>]*>\s*(gpt-[\w.-]+|o\d+[-.\w]*)\s*<\/td>[\s\S]*?<td[^>]*>\s*\$?([\d.,]+)\s*<\/td>[\s\S]*?<td[^>]*>[\s\S]*?<\/td>[\s\S]*?<td[^>]*>\s*\$?([\d.,]+)\s*<\/td>/gi;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlTableRowRe.exec(html)) !== null) {
    const id = htmlMatch[1].trim().toLowerCase();
    const input = parseFloat(htmlMatch[2].replace(/,/g, ""));
    const output = parseFloat(htmlMatch[3].replace(/,/g, ""));
    if (!/^(gpt-|o\d)/i.test(id)) continue;
    const existing = details.find((d) => d.id === id);
    if (existing) {
      if (existing.promptPer1M == null) existing.promptPer1M = input;
      if (existing.completionPer1M == null) existing.completionPer1M = output;
    } else {
      details.push({ id, name: id, promptPer1M: input, completionPer1M: output });
    }
  }
  return details;
}

// Helper function to get user ID from OAuth state
async function getUserIdFromOAuthState(state: string): Promise<string | null> {
  try {
    const session = await databaseStorage.getOAuthSession(state);
    return session ? session.userId : null;
  } catch (error) {
    console.error('Error getting user from OAuth state:', error);
    return null;
  }
}

/** Sign-in-or-sign-up: find by (provider, providerAccountId), else link by verified email, else create user. Keeps users.githubId/googleId in sync. */
async function findOrCreateUserFromOAuth(params: {
  provider: "github" | "google";
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name?: string | null;
  suggestedUsername: string;
  token: string;
  isLinkingFlow: boolean;
  currentUserId: string | null;
}): Promise<{ user: import("@shared/schema").User; isNewUser: boolean }> {
  const { provider, providerAccountId, email, emailVerified, suggestedUsername, token, isLinkingFlow, currentUserId } = params;

  if (isLinkingFlow && currentUserId) {
    const currentUser = await databaseStorage.getUserById(currentUserId);
    if (!currentUser) throw new Error("Current user not found");
    const existing = await databaseStorage.getOAuthIdentity(provider, providerAccountId);
    if (existing && existing.userId !== currentUser.id) {
      throw new Error("This account is already connected to another user.");
    }
    if (!existing) {
      await databaseStorage.createOAuthIdentity({
        provider,
        providerAccountId,
        userId: currentUser.id,
        email: email ?? currentUser.email ?? null,
        verified: emailVerified,
      });
    }
    const updates = provider === "github"
      ? { githubId: providerAccountId, githubToken: token, ...(email && { email }), ...(emailVerified && { emailVerified: true }) }
      : { googleId: providerAccountId, googleToken: token, ...(email && { email }), ...(emailVerified && { emailVerified: true }) };
    const user = await databaseStorage.updateUser(currentUser.id, updates);
    if (!user) throw new Error("Failed to update user");
    return { user, isNewUser: false };
  }

  const identity = await databaseStorage.getOAuthIdentity(provider, providerAccountId);
  if (identity) {
    let user = await databaseStorage.getUserById(identity.userId);
    if (!user) throw new Error("User not found for OAuth identity");
    const updates = provider === "github"
      ? { githubToken: token, ...(email && { email }), ...(emailVerified && { emailVerified: true }) }
      : { googleToken: token, ...(email && { email }), ...(emailVerified && { emailVerified: true }) };
    user = await databaseStorage.updateUser(user.id, updates) ?? user;
    return { user, isNewUser: false };
  }

  if (emailVerified && email) {
    const existingUser = await databaseStorage.getUserByEmail(email);
    if (existingUser) {
      await databaseStorage.createOAuthIdentity({
        provider,
        providerAccountId,
        userId: existingUser.id,
        email,
        verified: true,
      });
      const updates = provider === "github"
        ? { githubId: providerAccountId, githubToken: token, emailVerified: true }
        : { googleId: providerAccountId, googleToken: token, emailVerified: true };
      const user = await databaseStorage.updateUser(existingUser.id, updates);
      if (!user) throw new Error("Failed to link OAuth to existing user");
      return { user, isNewUser: false };
    }
  }

  let username = suggestedUsername;
  let counter = 0;
  while (true) {
    const existing = await databaseStorage.getUserByUsername(username);
    if (!existing) break;
    username = `${suggestedUsername}${counter || ""}`;
    counter = counter ? counter + 1 : 1;
  }

  const createPayload = provider === "github"
    ? { username, email: email ?? undefined, githubId: providerAccountId, githubToken: token, emailVerified: emailVerified }
    : { username, email: email ?? undefined, googleId: providerAccountId, googleToken: token, emailVerified: emailVerified };
  let user = await databaseStorage.createUser(createPayload as import("@shared/schema").InsertUser);
  await databaseStorage.createOAuthIdentity({
    provider,
    providerAccountId,
    userId: user.id,
    email: email ?? null,
    verified: emailVerified,
  });
  return { user, isNewUser: true };
}

const SALT_ROUNDS = process.env.SALT_ROUNDS ? parseInt(process.env.SALT_ROUNDS) : 10;
const BILLING_ENABLED = isBillingEnabled();
const APP_ENV = process.env.APP_ENV || "production";

function parseCsvEnv(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const STAGING_ADMIN_EMAILS = parseCsvEnv(process.env.STAGING_ADMIN_EMAILS);
const STAGING_ADMIN_USERNAMES = parseCsvEnv(process.env.STAGING_ADMIN_USERNAMES);
const PROMOTE_PROD_WEBHOOK_URL = process.env.PROMOTE_PROD_WEBHOOK_URL || "";
const PROMOTE_PROD_WEBHOOK_SECRET = process.env.PROMOTE_PROD_WEBHOOK_SECRET || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_PAT || "";

function resolveAppDir(): string {
  const candidates = [
    process.env.APP_DIR,
    process.cwd(),
    "/app",
    "/var/www/pushlog",
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch {}
  }
  return process.cwd();
}

function readLastLines(filePath: string, maxLines = 40): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .slice(-maxLines);
  } catch {
    return [];
  }
}

// Cache GitHub commits for 60s so polling doesn't burn through rate limits or add latency
let _ghCommitsCache: { data: Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }>; ts: number } | null = null;
const GH_CACHE_TTL = 60_000; // 60 seconds

async function fetchRecentCommitsFromGitHub(limit = 30): Promise<Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }>> {
  // Return cached data if fresh
  if (_ghCommitsCache && Date.now() - _ghCommitsCache.ts < GH_CACHE_TTL && _ghCommitsCache.data.length > 0) {
    return _ghCommitsCache.data;
  }

  const url = `https://api.github.com/repos/carterjohndixon/PushLog/commits?per_page=${limit}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  }
  const opts: RequestInit = { headers };
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) {
        const remaining = res.headers.get("x-ratelimit-remaining");
        console.error(`[fetchGitHubCommits] attempt ${attempt}: HTTP ${res.status}, rate-limit-remaining: ${remaining}, token: ${GITHUB_TOKEN ? "yes" : "no"}`);
        if (attempt < maxAttempts) continue;
        // Return stale cache if available rather than nothing
        return _ghCommitsCache?.data || [];
      }
      const data: any[] = await res.json();
      const list = data
        .map((item) => ({
          sha: String(item?.sha || ""),
          shortSha: String(item?.sha || "").slice(0, 7),
          dateIso: String(item?.commit?.author?.date || ""),
          author: String(item?.commit?.author?.name || item?.author?.login || "unknown"),
          subject: String(item?.commit?.message || "").split("\n")[0] || "No commit message",
        }))
        .filter((c) => !!c.sha);
      if (list.length > 0) {
        _ghCommitsCache = { data: list, ts: Date.now() };
        return list;
      }
      if (attempt < maxAttempts) continue;
      return _ghCommitsCache?.data || [];
    } catch (err: any) {
      console.error(`[fetchGitHubCommits] attempt ${attempt} error:`, err?.message || err);
      if (attempt >= maxAttempts) return _ghCommitsCache?.data || [];
    }
  }
  return _ghCommitsCache?.data || [];
}

/** Match deployed SHA to a commit: exact, or by prefix (7-char / 40-char). */
function commitShaMatches(
  commitSha: string,
  commitShortSha: string,
  deployedSha: string
): boolean {
  const d = deployedSha.trim().toLowerCase();
  const full = (commitSha || "").trim().toLowerCase();
  const short = (commitShortSha || full.slice(0, 7)).toLowerCase();
  if (!d) return false;
  if (full === d || short === d) return true;
  if (full.startsWith(d) || (d.length >= 7 && full.startsWith(d.slice(0, 7)))) return true;
  return false;
}

function derivePendingFromRecent(
  recentCommits: Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }>,
  deployedSha: string | null
) {
  if (!recentCommits.length || !deployedSha?.trim()) {
    return { pendingCount: 0, pendingCommits: [] as Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }> };
  }
  const idx = recentCommits.findIndex((c) => commitShaMatches(c.sha, c.shortSha, deployedSha));
  if (idx === -1) {
    return { pendingCount: 0, pendingCommits: [] as Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }> };
  }
  const pendingCommits = recentCommits.slice(0, idx);
  return { pendingCount: pendingCommits.length, pendingCommits };
}

async function isPromotionProcessRunning(): Promise<boolean> {
  try {
    await execAsync("pgrep -f deploy-production.sh || pgrep -f 'npm run build:production'");
    return true;
  } catch {
    return false;
  }
}

async function clearStalePromotionLockIfNeeded(appDir: string, lockFile: string): Promise<boolean> {
  if (!fs.existsSync(lockFile)) return false;
  const running = await isPromotionProcessRunning();
  if (running) return false;

  try {
    fs.unlinkSync(lockFile);
  } catch {
    return false;
  }

  try {
    const logFile = path.join(appDir, "deploy-production.log");
    const line = `[${new Date().toISOString().replace("T", " ").slice(0, 19)}] Stale promotion lock removed automatically\n`;
    fs.appendFileSync(logFile, line);
  } catch {}

  return true;
}

async function getCurrentUser(req: any) {
  const userId = req?.user?.userId;
  if (!userId) return null;
  return await storage.getUser(userId);
}

async function ensureStagingAdmin(req: any, res: any): Promise<{ ok: true; user: any } | { ok: false }> {
  if (APP_ENV !== "staging") {
    res.status(404).json({ error: "Not found" });
    return { ok: false };
  }

  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return { ok: false };
  }

  const email = String(user.email || "").toLowerCase();
  const username = String(user.username || "").toLowerCase();
  const allowedByEmail = email && STAGING_ADMIN_EMAILS.includes(email);
  const allowedByUsername = username && STAGING_ADMIN_USERNAMES.includes(username);

  if (!allowedByEmail && !allowedByUsername) {
    res.status(403).json({ error: "Admin access required" });
    return { ok: false };
  }

  return { ok: true, user };
}

/** Same password rules as signup; used for reset-password and change-password (AUTH-VULN-21). Returns error message or null if valid. */
function validatePasswordRequirements(password: string): string | null {
  const requirements = {
    minLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
  const missing = Object.entries(requirements)
    .filter(([, meets]) => !meets)
    .map(([req]) => {
      switch (req) {
        case "minLength": return "at least 8 characters";
        case "hasUpperCase": return "an uppercase letter";
        case "hasLowerCase": return "a lowercase letter";
        case "hasNumber": return "a number";
        case "hasSpecialChar": return "a special character";
        default: return "";
      }
    })
    .filter(Boolean);
  if (missing.length === 0) return null;
  return `Password must contain ${missing.join(", ")}`;
}

/** Slack slash command handler. Must be mounted with express.raw({ type: 'application/x-www-form-urlencoded' }) so req.body is a Buffer. Always returns 200 so Slack shows our message instead of "dispatch_failed". */
export async function slackCommandsHandler(req: Request, res: Response): Promise<void> {
  const rawBody = req.body;
  if (!rawBody || !(rawBody instanceof Buffer)) {
    res.status(200).json({ response_type: "ephemeral", text: "Invalid request body." });
    return;
  }
  const signature = req.headers["x-slack-signature"] as string | undefined;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("SLACK_SIGNING_SECRET not configured");
    res.status(200).json({ response_type: "ephemeral", text: "Slack commands are not configured. Set SLACK_SIGNING_SECRET." });
    return;
  }
  const timestampHeader = req.headers["x-slack-request-timestamp"] as string | undefined;
  if (!verifySlackRequest(rawBody, signature, signingSecret, timestampHeader)) {
    res.status(200).json({ response_type: "ephemeral", text: "Invalid request signature. Check that Request URL is exactly your app URL + /api/slack/commands and Signing Secret matches the app." });
    return;
  }
  const payload = parseSlackCommandBody(rawBody.toString("utf8"));
  const getIntegrationsForChannel = async (teamId: string, channelId: string) => {
    const tid = (teamId || "").trim();
    const cid = (channelId || "").trim();
    const integrations = await databaseStorage.getIntegrationsBySlackTeamAndChannel(tid, cid);
    const result: { repositoryName: string; slackChannelName: string; aiModel: string | null; isActive: boolean }[] = [];
    for (const i of integrations) {
      const repo = await databaseStorage.getRepository(i.repositoryId);
      result.push({
        repositoryName: repo?.name ?? "Unknown",
        slackChannelName: i.slackChannelName,
        aiModel: i.aiModel ?? null,
        isActive: !!i.isActive,
      });
    }
    return result;
  };
  try {
    const response = await handleSlackCommand(payload, getIntegrationsForChannel);
    res.status(200).json(response);
  } catch (err) {
    console.error("Slack command error:", err);
    res.status(200).json({ response_type: "ephemeral", text: "Something went wrong. Try again later." });
  }
}

/** GitHub webhook handler. Delegates to githubWebhook module. */
export async function githubWebhookHandler(req: Request, res: Response): Promise<void> {
  return handleGitHubWebhook(req, res);
}

/** Sentry webhook handler. Delegates to sentryWebhook module. */
export async function sentryWebhookHandler(req: Request, res: Response): Promise<void> {
  return handleSentryWebhook(req, res);
}

export async function registerRoutes(app: Express): Promise<Server> {
  const handleIncidentSummary = async (summary: IncidentSummaryOutput) => {
    console.log(
      `[incident-engine] incident ${summary.incident_id} (${summary.trigger}) ${summary.service}/${summary.environment}: ${summary.title}`
    );

    // Route to one user when payload includes links.pushlog_user_id; otherwise users with repos + "Receive incident notifications" on.
    const targetUsers = new Set<string>();
    const linkedUserId = summary.links?.pushlog_user_id?.trim();
    if (linkedUserId) targetUsers.add(linkedUserId);

    if (targetUsers.size === 0) {
      const defaultTargets = await getIncidentNotificationTargets(false);
      for (const id of defaultTargets) targetUsers.add(id);
    }

    if (targetUsers.size === 0) return;

    const topSymptom = (summary as any).top_symptoms?.[0];
    const actualErrorMessage = topSymptom?.message != null ? String(topSymptom.message).trim() : undefined;
    const actualExceptionType = topSymptom?.exception_type != null ? String(topSymptom.exception_type).trim() : undefined;
    const message =
      actualErrorMessage != null && actualErrorMessage.length > 0
        ? (actualExceptionType ? `${actualExceptionType}: ${actualErrorMessage}` : actualErrorMessage)
        : `${summary.trigger.replace(/_/g, " ")} detected in ${summary.service}/${summary.environment} (priority ${summary.priority_score})`;
    const rawStacktraceForMeta = (summary as any).stacktrace ?? [];
    const appStacktraceForMeta = rawStacktraceForMeta.filter(
      (f: any) => f?.file && !String(f.file).includes("node_modules")
    );

    const resolveFrame = async (f: any): Promise<{ file: string; function?: string; line?: number }> => {
      const file = String(f?.file || "");
      const line = f?.line;
      const col = f?.colno ?? 0;
      if (line == null || !file) return { file, function: f?.function, line };
      const resolved = await resolveToSource(file, line, col);
      if (resolved) {
        const lastColon = resolved.lastIndexOf(":");
        if (lastColon > 0) {
          const srcFile = resolved.slice(0, lastColon);
          const srcLine = parseInt(resolved.slice(lastColon + 1), 10);
          if (!isNaN(srcLine)) {
            return { file: srcFile, function: f?.function, line: srcLine };
          }
        }
      }
      return { file, function: f?.function, line };
    };
    const resolvedStacktraceForMeta = await Promise.all(appStacktraceForMeta.map(resolveFrame));

    const metadata = JSON.stringify({
      incidentId: summary.incident_id,
      service: summary.service,
      environment: summary.environment,
      trigger: summary.trigger,
      severity: summary.severity,
      priorityScore: summary.priority_score,
      startTime: summary.start_time,
      lastSeen: summary.last_seen,
      peakTime: (summary as any).peak_time,
      topSymptoms: (summary as any).top_symptoms ?? [],
      suspectedCauses: (summary as any).suspected_causes ?? [],
      recommendedFirstActions: (summary as any).recommended_first_actions ?? [],
      stacktrace: resolvedStacktraceForMeta,
      links: summary.links || {},
    });

    // When Sentry webhook already sent an in-app notification, skip creating a second one — but still send the email.
    // The incident engine email is the single combined email (Sentry event + spike/new_issue/regression classification).
    const skipInAppDuplicate = wasRecentSentryNotification(summary.service, summary.environment);

    await Promise.all(
      Array.from(targetUsers).map(async (userId) => {
        try {
          if (!skipInAppDuplicate) {
            const notif = await storage.createNotification({
              userId,
              type: "incident_alert",
              title: summary.title,
              message,
              metadata,
            });
            broadcastNotification(userId, {
              id: notif.id,
              type: notif.type,
              title: notif.title,
              message: notif.message,
              metadata: notif.metadata,
              createdAt: notif.createdAt,
              isRead: false,
            });
          }
          const user = await storage.getUser(userId);
          if (user?.email && (user as any).incidentEmailEnabled !== false) {
            const rawStacktrace = (summary as any).stacktrace ?? [];
            const appFrames = rawStacktrace.filter(
              (f: any) => f?.file && !String(f.file).includes("node_modules")
            );
            const resolvedStacktrace = await Promise.all(appFrames.map(resolveFrame));
            const firstResolved = resolvedStacktrace[0];
            const stackFrame =
              firstResolved?.file
                ? firstResolved.line != null
                  ? `${firstResolved.file}:${firstResolved.line}`
                  : firstResolved.file
                : undefined;

            void sendIncidentAlertEmail(user.email, summary.title, message, {
              service: summary.service,
              environment: summary.environment,
              severity: summary.severity,
              route: (summary as any).api_route,
              stackFrame,
              requestUrl: (summary as any).request_url,
              stacktrace: resolvedStacktrace,
              sourceUrl: summary.links?.source_url,
              createdAt: summary.last_seen || summary.start_time,
              errorMessage: actualErrorMessage ?? undefined,
              exceptionType: actualExceptionType ?? undefined,
            });
          }
        } catch (err) {
          console.warn(`[incident-engine] failed to notify user ${userId}:`, err);
        }
      })
    );
  };

  // Subscribe once to incident-engine summaries for UI notifications + logs.
  onIncidentSummary((summary) => {
    void handleIncidentSummary(summary);
  });

  // Health check endpoints
  app.get("/health", (req, res) => {
    res.status(200).json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Incident webhook endpoint (Sentry-style event JSON)
  // Optional shared-secret auth via INCIDENT_WEBHOOK_SECRET header.
  app.post("/api/webhooks/incidents", async (req, res) => {
    try {
      const configuredSecret = process.env.INCIDENT_WEBHOOK_SECRET?.trim();
      if (configuredSecret) {
        const providedSecret =
          (req.headers["x-incident-webhook-secret"] as string | undefined)?.trim() || "";
        if (!providedSecret || providedSecret !== configuredSecret) {
          return res.status(401).json({ error: "Unauthorized" });
        }
      }

      const schema = z.object({
        source: z.string().min(1),
        service: z.string().min(1),
        environment: z.string().min(1),
        timestamp: z.string().min(1),
        severity: z.enum(["warning", "error", "critical"]),
        exception_type: z.string().min(1),
        message: z.string().min(1),
        stacktrace: z
          .array(
            z.object({
              file: z.string().min(1),
              function: z.string().optional(),
              line: z.number().int().positive().optional(),
            })
          )
          .min(1),
        tags: z.record(z.string(), z.string()).optional(),
        links: z.record(z.string(), z.string()).optional(),
        change_window: z
          .object({
            deploy_time: z.string().min(1),
            commits: z.array(
              z.object({
                id: z.string().min(1),
                timestamp: z.string().optional(),
                files: z.array(z.string()),
              })
            ),
          })
          .optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid incident payload",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const event = parsed.data as IncidentEventInput;
      ingestIncidentEvent(event);
      return res.status(202).json({ accepted: true });
    } catch (error) {
      console.error("Incident webhook error:", error);
      Sentry.captureException(error);
      return res.status(500).json({ error: "Failed to ingest incident event" });
    }
  });

  // Sentry webhook is mounted in index.ts with express.raw() so signature is verified against raw body.

  // Production webhook: trigger host-side production promotion script.
  // Intended to be called by staging admin flow with x-promote-secret.
  app.post("/api/webhooks/promote-production", async (req, res) => {
    try {
      if (APP_ENV !== "production") {
        return res.status(404).json({ error: "Not found" });
      }

      const providedSecret = String(req.headers["x-promote-secret"] || "");
      const expectedSecret = process.env.PROMOTE_PROD_WEBHOOK_SECRET || "";
      if (!expectedSecret || providedSecret !== expectedSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const appDir = resolveAppDir();
      const promoteScript = path.join(appDir, "deploy-production.sh");
      if (!fs.existsSync(promoteScript)) {
        return res.status(500).json({ error: "deploy-production.sh not found" });
      }

      const lockFile = path.join(appDir, ".promote-production.lock");
      await clearStalePromotionLockIfNeeded(appDir, lockFile);
      if (fs.existsSync(lockFile)) {
        return res.status(409).json({ error: "Promotion already in progress" });
      }

      const targetSha = String(req.body?.headSha || "").trim();
      const isRollback = !!req.body?.isRollback;
      fs.writeFileSync(
        lockFile,
        JSON.stringify(
          {
            startedAt: new Date().toISOString(),
            byWebhook: true,
            by: req.body?.promotedBy || "staging-admin",
            targetSha: targetSha || undefined,
            isRollback: isRollback || undefined,
          },
          null,
          2
        )
      );

      // PM2 treekill kills ALL descendants of the worker process, even detached ones.
      // Use nohup setsid to launch the script in a completely new session so it's
      // NOT a descendant of this worker and survives PM2 restart.
      const promotedBy = String(req.body?.promotedBy || "staging-admin");
      const promotedSha = String(req.body?.headSha || "").trim();
      const cmd = `nohup setsid bash "${promoteScript}" </dev/null >>"${path.join(appDir, "deploy-promotion-stdout.log")}" 2>&1 &`;
      exec(cmd, {
        cwd: appDir,
        env: {
          ...process.env,
          APP_DIR: appDir,
          PROMOTED_BY: promotedBy,
          PROMOTED_SHA: promotedSha,
          PROMOTE_LOCK_FILE: lockFile,
        },
      });

      return res.json({
        message: "Production promotion started",
        startedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Failed to start production promotion webhook:", error);
      Sentry.captureException(error);
      return res.status(500).json({ error: error?.message || "Failed to start promotion" });
    }
  });

  // Production webhook: cancel an in-progress promotion (kill deploy script, remove lock).
  app.post("/api/webhooks/promote-production/cancel", async (req, res) => {
    try {
      if (APP_ENV !== "production") {
        return res.status(404).json({ error: "Production webhook not enabled (set APP_ENV=production on production server)" });
      }

      const providedSecret = String(req.headers["x-promote-secret"] || "");
      const expectedSecret = process.env.PROMOTE_PROD_WEBHOOK_SECRET || "";
      if (!expectedSecret || providedSecret !== expectedSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const appDir = resolveAppDir();
      const lockFile = path.join(appDir, ".promote-production.lock");
      await clearStalePromotionLockIfNeeded(appDir, lockFile);

      if (!fs.existsSync(lockFile)) {
        return res.json({ message: "No promotion in progress", cancelledAt: new Date().toISOString() });
      }

      // Kill any running deploy-production.sh processes
      try {
        await execAsync("pkill -f deploy-production.sh || true", { cwd: appDir });
        // Also kill child processes (npm, vite, esbuild)
        await execAsync("pkill -f 'npm run build:production' || true", { cwd: appDir });
      } catch {}

      // Remove lock
      try { fs.unlinkSync(lockFile); } catch {}

      // Log cancellation
      const logFile = path.join(appDir, "deploy-production.log");
      const cancelLine = `[${new Date().toISOString().replace("T", " ").slice(0, 19)}] Promotion CANCELLED by ${req.body?.cancelledBy || "admin"}\n`;
      fs.appendFileSync(logFile, cancelLine);

      return res.json({ message: "Promotion cancelled", cancelledAt: new Date().toISOString() });
    } catch (error: any) {
      console.error("Failed to cancel production promotion:", error);
      Sentry.captureException(error);
      return res.status(500).json({ error: error?.message || "Failed to cancel promotion" });
    }
  });

  // Production webhook status: used by staging admin to show live promotion progress.
  app.get("/api/webhooks/promote-production/status", async (req, res) => {
    try {
      if (APP_ENV !== "production") {
        return res.status(404).json({ error: "Not found" });
      }

      const providedSecret = String(req.headers["x-promote-secret"] || "");
      const expectedSecret = process.env.PROMOTE_PROD_WEBHOOK_SECRET || "";
      if (!expectedSecret || providedSecret !== expectedSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const appDir = resolveAppDir();
      const lockFile = path.join(appDir, ".promote-production.lock");
      const logFile = path.join(appDir, "deploy-production.log");
      const prodShaFile = path.join(appDir, ".prod_deployed_sha");
      const prodAtFile = path.join(appDir, ".prod_deployed_at");
      await clearStalePromotionLockIfNeeded(appDir, lockFile);

      let lockData: any = null;
      if (fs.existsSync(lockFile)) {
        try {
          lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        } catch {
          lockData = { raw: fs.readFileSync(lockFile, "utf8").trim() };
        }
      }

      // Git info: use branch ref (origin/main) so history stays correct after rollback (detached HEAD).
      // When in detached HEAD (e.g. after rollback), always use GitHub API - never trust local git for history.
      let branch = "unknown";
      let headSha = "";
      let recentCommitsRaw = "";
      let branchRef: string | null = null;
      let isDetachedHead = false;
      try {
        await execAsync("git fetch origin", { cwd: appDir }).catch(() => {});
        const branchOut = (await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: appDir })).stdout.trim();
        isDetachedHead = branchOut === "HEAD";
        if (!isDetachedHead) {
          branch = branchOut;
        }
        if (!isDetachedHead) {
          for (const ref of ["origin/main", "origin/master", "main"]) {
            try {
              await execAsync(`git rev-parse ${ref}`, { cwd: appDir });
              branchRef = ref;
              if (branch === "unknown") branch = ref.replace("origin/", "");
              break;
            } catch {
              continue;
            }
          }
          if (branchRef) {
            const [{ stdout: headOut }, { stdout: recentLogOut }] = await Promise.all([
              execAsync(`git rev-parse ${branchRef}`, { cwd: appDir }),
              execAsync(`git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso ${branchRef} -n 30`, { cwd: appDir }),
            ]);
            headSha = headOut.trim();
            recentCommitsRaw = recentLogOut;
          }
        }
      } catch {}

      const prodDeployedSha = fs.existsSync(prodShaFile) ? fs.readFileSync(prodShaFile, "utf8").trim() : null;
      const prodDeployedAt = fs.existsSync(prodAtFile) ? fs.readFileSync(prodAtFile, "utf8").trim() : null;

      let recentCommits = recentCommitsRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [sha, shortSha, dateIso, author, ...subjectParts] = line.split("|");
          return { sha, shortSha, dateIso, author, subject: subjectParts.join("|") };
        });

      // Always prefer canonical GitHub history for Admin timeline.
      // If GitHub is unavailable/rate-limited, fall back to local git history.
      const githubCommits = await fetchRecentCommitsFromGitHub(30);
      if (githubCommits.length > 0) {
        recentCommits = githubCommits;
        if (!headSha && recentCommits[0]?.sha) headSha = recentCommits[0].sha;
        if (branch === "unknown") branch = "main";
      } else if (recentCommits.length === 0) {
        try {
          const [{ stdout: headOut }, { stdout: recentLogOut }] = await Promise.all([
            execAsync("git rev-parse HEAD", { cwd: appDir }),
            execAsync("git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso HEAD -n 30", { cwd: appDir }),
          ]);
          headSha = headOut.trim() || headSha;
          recentCommits = recentLogOut
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [sha, shortSha, dateIso, author, ...subjectParts] = line.split("|");
              return { sha, shortSha, dateIso, author, subject: subjectParts.join("|") };
            });
          if (branch === "unknown" && recentCommits.length > 0) {
            branch = isDetachedHead ? "detached" : "main";
          }
        } catch {
          // ignore local fallback errors
        }
      }

      // Compute pending commits: branch tip vs deployed SHA (uses branch ref, not HEAD)
      let pendingCount = 0;
      let pendingCommits: Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }> = [];
      if (prodDeployedSha && headSha && branchRef) {
        try {
          const [{ stdout: countOut }, { stdout: pendingOut }] = await Promise.all([
            execAsync(`git rev-list --count ${prodDeployedSha}..${branchRef}`, { cwd: appDir }),
            execAsync(`git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso ${prodDeployedSha}..${branchRef} -n 30`, { cwd: appDir }),
          ]);
          pendingCount = Number(countOut.trim() || "0");
          pendingCommits = pendingOut
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [sha, shortSha, dateIso, author, ...subjectParts] = line.split("|");
              return { sha, shortSha, dateIso, author, subject: subjectParts.join("|") };
            });
        } catch {
          pendingCount = 0;
          pendingCommits = [];
        }
      }
      if (pendingCommits.length === 0 && recentCommits.length > 0) {
        const derived = derivePendingFromRecent(recentCommits, prodDeployedSha);
        pendingCount = derived.pendingCount;
        pendingCommits = derived.pendingCommits;
      }
      if (pendingCommits.length > 0 && pendingCount !== pendingCommits.length) {
        pendingCount = pendingCommits.length;
      }

      return res.json({
        inProgress: fs.existsSync(lockFile),
        lock: lockData,
        recentLogLines: readLastLines(logFile, 80),
        prodDeployedSha,
        prodDeployedAt,
        branch,
        headSha,
        recentCommits,
        pendingCount,
        pendingCommits,
      });
    } catch (error: any) {
      console.error("Failed to load promotion webhook status:", error);
      Sentry.captureException(error);
      return res.status(500).json({ error: error?.message || "Failed to load promotion status" });
    }
  });

  // Staging admin: show promotion status and pending commits
  app.get("/api/admin/staging/status", authenticateToken, async (req: any, res: any) => {
    try {
      const admin = await ensureStagingAdmin(req, res);
      if (!admin.ok) return;

      const appDir = resolveAppDir();
      const prodShaFile = path.join(appDir, ".prod_deployed_sha");
      const prodAtFile = path.join(appDir, ".prod_deployed_at");
      const promoteScript = path.join(appDir, "deploy-production.sh");
      const promoteViaWebhook = APP_ENV === "staging" && isProductionDeployConfigured();

      let branch = "unknown";
      let headSha = "";
      let recentOut = "";
      let branchRef: string | null = null;
      let isDetachedHead = false;
      try {
        await execAsync("git fetch origin", { cwd: appDir }).catch(() => {});
        const branchOut = (await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: appDir })).stdout.trim();
        isDetachedHead = branchOut === "HEAD";
        if (!isDetachedHead) {
          branch = branchOut;
        }
        if (!isDetachedHead) {
          for (const ref of ["origin/main", "origin/master", "main"]) {
            try {
              await execAsync(`git rev-parse ${ref}`, { cwd: appDir });
              branchRef = ref;
              if (branch === "unknown") branch = ref.replace("origin/", "");
              break;
            } catch {
              continue;
            }
          }
          if (branchRef) {
            const [{ stdout: headOut }, { stdout: recentLogOut }] = await Promise.all([
              execAsync(`git rev-parse ${branchRef}`, { cwd: appDir }),
              execAsync(`git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso ${branchRef} -n 20`, { cwd: appDir }),
            ]);
            headSha = headOut.trim();
            recentOut = recentLogOut;
          }
        }
      } catch {
        // Running in a container/dir without git metadata; keep admin page usable.
      }
      const prodDeployedSha = fs.existsSync(prodShaFile) ? fs.readFileSync(prodShaFile, "utf8").trim() : null;
      const prodDeployedAt = fs.existsSync(prodAtFile) ? fs.readFileSync(prodAtFile, "utf8").trim() : null;

      let recentCommits = recentOut
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [sha, shortSha, dateIso, author, ...subjectParts] = line.split("|");
          return { sha, shortSha, dateIso, author, subject: subjectParts.join("|") };
        });

      // Always prefer canonical GitHub history for Admin timeline.
      // If GitHub is unavailable/rate-limited, fall back to local git history.
      const githubCommits = await fetchRecentCommitsFromGitHub(30);
      if (githubCommits.length > 0) {
        recentCommits = githubCommits;
        if (!headSha && recentCommits[0]?.sha) headSha = recentCommits[0].sha;
        if (branch === "unknown") branch = "main";
      } else if (recentCommits.length === 0) {
        try {
          const [{ stdout: headOut }, { stdout: recentLogOut }] = await Promise.all([
            execAsync("git rev-parse HEAD", { cwd: appDir }),
            execAsync("git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso HEAD -n 30", { cwd: appDir }),
          ]);
          headSha = headOut.trim() || headSha;
          recentCommits = recentLogOut
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [sha, shortSha, dateIso, author, ...subjectParts] = line.split("|");
              return { sha, shortSha, dateIso, author, subject: subjectParts.join("|") };
            });
          if (branch === "unknown" && recentCommits.length > 0) {
            branch = isDetachedHead ? "detached" : "main";
          }
        } catch {
          // Running in a container/dir without git metadata; keep admin page usable.
        }
      }

      let pendingCount = 0;
      let pendingCommits: Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }> = [];
      if (prodDeployedSha && headSha && branchRef) {
        try {
          const [{ stdout: countOut }, { stdout: pendingOut }] = await Promise.all([
            execAsync(`git rev-list --count ${prodDeployedSha}..${branchRef}`, { cwd: appDir }),
            execAsync(`git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso ${prodDeployedSha}..${branchRef} -n 20`, { cwd: appDir }),
          ]);
          pendingCount = Number(countOut.trim() || "0");
          pendingCommits = pendingOut
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [sha, shortSha, dateIso, author, ...subjectParts] = line.split("|");
              return { sha, shortSha, dateIso, author, subject: subjectParts.join("|") };
            });
        } catch {
          pendingCount = 0;
          pendingCommits = [];
        }
      }

      const lockFile = path.join(appDir, ".promote-production.lock");
      const promoteInProgress = fs.existsSync(lockFile);
      let promoteRemoteStatus: any = null;
      if (promoteViaWebhook) {
        const statusResult = await getProductionPromotionStatus();
        if (statusResult.ok) {
          promoteRemoteStatus = statusResult.data;
        } else {
          promoteRemoteStatus = { error: statusResult.error };
        }
      }

      // Use remote (prod) data as fallback when staging has no git (Docker)
      const hasLocalGit = branch !== "unknown" && headSha !== "";
      const remote = promoteRemoteStatus && !promoteRemoteStatus.error ? promoteRemoteStatus : null;

      let finalBranch = hasLocalGit ? branch : (remote?.branch || "unknown");
      let finalHeadSha = hasLocalGit ? headSha : (remote?.headSha || "");
      const finalProdDeployedSha = prodDeployedSha || remote?.prodDeployedSha || null;
      const finalProdDeployedAt = prodDeployedAt || remote?.prodDeployedAt || null;
      let finalRecentCommits = recentCommits.length > 0 ? recentCommits : (remote?.recentCommits || []);
      let finalPendingCount = hasLocalGit ? pendingCount : (remote?.pendingCount ?? 0);
      let finalPendingCommits = pendingCommits.length > 0 ? pendingCommits : (remote?.pendingCommits || []);

      // Always fetch from GitHub as the canonical source — production may be on old code after rollback
      if (finalRecentCommits.length === 0) {
        finalRecentCommits = await fetchRecentCommitsFromGitHub(30);
      }
      if (!finalHeadSha && finalRecentCommits[0]?.sha) {
        finalHeadSha = finalRecentCommits[0].sha;
      }
      if (finalBranch === "unknown" && finalRecentCommits.length > 0) {
        finalBranch = "main";
      }
      if (finalPendingCommits.length === 0 && finalRecentCommits.length > 0) {
        const derived = derivePendingFromRecent(finalRecentCommits, finalProdDeployedSha);
        finalPendingCount = derived.pendingCount;
        finalPendingCommits = derived.pendingCommits;
      }
      // Keep count in sync with list (e.g. if remote or local gave inconsistent data)
      if (finalPendingCommits.length > 0 && finalPendingCount !== finalPendingCommits.length) {
        finalPendingCount = finalPendingCommits.length;
      }

      res.json({
        appEnv: APP_ENV,
        branch: finalBranch,
        headSha: finalHeadSha,
        prodDeployedSha: finalProdDeployedSha,
        prodDeployedAt: finalProdDeployedAt,
        pendingCount: finalPendingCount,
        promoteInProgress: remote ? !!remote.inProgress : promoteInProgress,
        promoteScriptExists: fs.existsSync(promoteScript),
        promoteViaWebhook,
        promoteAvailable: promoteViaWebhook || fs.existsSync(promoteScript),
        promoteConfig: {
          webhookUrlConfigured: !!PROMOTE_PROD_WEBHOOK_URL,
          webhookSecretConfigured: !!PROMOTE_PROD_WEBHOOK_SECRET,
        },
        promoteRemoteStatus,
        recentCommits: finalRecentCommits,
        pendingCommits: finalPendingCommits,
      });
    } catch (error: any) {
      console.error("Failed to load staging admin status:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: error?.message || "Failed to load status" });
    }
  });

  // Staging admin: approve and promote currently staged commit to production
  app.post("/api/admin/staging/promote", authenticateToken, async (req: any, res: any) => {
    try {
      const admin = await ensureStagingAdmin(req, res);
      if (!admin.ok) return;

      const promotedBy = String(admin.user.email || admin.user.username || admin.user.id || "unknown");
      const headSha = req.body?.headSha?.trim() || "";
      const isRollback = !!req.body?.isRollback;

      // When configured, ask the production server to start the deploy (staging doesn't run the script).
      if (isProductionDeployConfigured()) {
        const result = await requestProductionPromote({ promotedBy, headSha: headSha || undefined, isRollback });
        if (!result.ok) {
          if (result.status === 502) {
            console.error("[staging/promote] Production webhook unreachable:", result.error);
          }
          return res.status(result.status).json({ error: result.error });
        }
        return res.json({
          message: "Production promotion started via webhook",
          startedAt: new Date().toISOString(),
        });
      }

      // Fallback for non-container setups where script is local.
      const appDir = resolveAppDir();
      const promoteScript = path.join(appDir, "deploy-production.sh");
      const lockFile = path.join(appDir, ".promote-production.lock");
      if (!fs.existsSync(promoteScript)) {
        return res.status(500).json({ error: "deploy-production.sh not found and webhook is not configured" });
      }
      if (fs.existsSync(lockFile)) {
        return res.status(409).json({ error: "Promotion already in progress" });
      }
      const promotedSha = String(req.body?.headSha || "").trim();
      fs.writeFileSync(
        lockFile,
        JSON.stringify(
          { startedAt: new Date().toISOString(), by: promotedBy, targetSha: promotedSha || undefined, isRollback },
          null,
          2
        )
      );
      const cmd = `nohup setsid bash "${promoteScript}" </dev/null >>"${path.join(appDir, "deploy-promotion-stdout.log")}" 2>&1 &`;
      exec(cmd, {
        cwd: appDir,
        env: {
          ...process.env,
          APP_DIR: appDir,
          PROMOTED_BY: promotedBy,
          PROMOTED_SHA: promotedSha,
          PROMOTE_LOCK_FILE: lockFile,
        },
      });

      return res.json({ message: "Production promotion started", startedAt: new Date().toISOString() });
    } catch (error: any) {
      console.error("Failed to start production promotion:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: error?.message || "Failed to start promotion" });
    }
  });

  // Staging admin: cancel an in-progress promotion
  app.post("/api/admin/staging/cancel-promote", authenticateToken, async (req: any, res: any) => {
    try {
      const admin = await ensureStagingAdmin(req, res);
      if (!admin.ok) return;

      const cancelledBy = String(admin.user.email || admin.user.username || admin.user.id || "unknown");

      // When configured, ask the production server to cancel (the running deploy is on production).
      if (isProductionDeployConfigured()) {
        const result = await requestProductionCancel({ cancelledBy });
        if (!result.ok) {
          if (result.status >= 500) {
            console.error("Cancel-promote: production returned error:", result.error);
          }
          return res.status(result.status).json({ error: result.error });
        }
        return res.json(result.data);
      }

      // Fallback: local cancel
      const appDir = resolveAppDir();
      const lockFile = path.join(appDir, ".promote-production.lock");
      if (!fs.existsSync(lockFile)) {
        return res.json({ message: "No promotion in progress", cancelledAt: new Date().toISOString() });
      }
      try {
        await execAsync("pkill -f deploy-production.sh || true", { cwd: appDir });
        await execAsync("pkill -f 'npm run build:production' || true", { cwd: appDir });
      } catch {}
      try { fs.unlinkSync(lockFile); } catch {}
      const logFile = path.join(appDir, "deploy-production.log");
      const cancelLine = `[${new Date().toISOString().replace("T", " ").slice(0, 19)}] Promotion CANCELLED by ${cancelledBy}\n`;
      fs.appendFileSync(logFile, cancelLine);
      return res.json({ message: "Promotion cancelled", cancelledAt: new Date().toISOString() });
    } catch (error: any) {
      console.error("Failed to cancel promotion:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: error?.message || "Failed to cancel" });
    }
  });

  // Admin: list AI model pricing (staging admin only)
  app.get("/api/admin/pricing", authenticateToken, async (req: any, res) => {
    const admin = await ensureStagingAdmin(req, res);
    if (!admin.ok) return;
    try {
      const rows = await databaseStorage.listAiModelPricing();
      res.status(200).json({
        pricing: rows.map((r) => ({
          id: r.id,
          provider: r.provider,
          modelId: r.modelId,
          inputUsdPer1M: r.inputUsdPer1M != null ? String(r.inputUsdPer1M) : "0",
          outputUsdPer1M: r.outputUsdPer1M != null ? String(r.outputUsdPer1M) : "0",
          updatedAt: r.updatedAt != null ? (typeof r.updatedAt === "string" ? r.updatedAt : new Date(r.updatedAt).toISOString()) : null,
        })),
      });
    } catch (err) {
      console.error("Admin pricing list error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load pricing" });
    }
  });

  // Admin: create or update one AI model pricing row (staging admin only)
  app.put("/api/admin/pricing", authenticateToken, async (req: any, res) => {
    const admin = await ensureStagingAdmin(req, res);
    if (!admin.ok) return;
    try {
      const body = req.body as { id?: string; provider?: string; modelId?: string; inputUsdPer1M?: number; outputUsdPer1M?: number };
      const provider = typeof body.provider === "string" ? body.provider.trim() : "";
      const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
      const inputUsdPer1M = typeof body.inputUsdPer1M === "number" ? body.inputUsdPer1M : Number(body.inputUsdPer1M);
      const outputUsdPer1M = typeof body.outputUsdPer1M === "number" ? body.outputUsdPer1M : Number(body.outputUsdPer1M);
      if (!provider || !modelId || Number.isNaN(inputUsdPer1M) || Number.isNaN(outputUsdPer1M)) {
        return res.status(400).json({ error: "provider, modelId, inputUsdPer1M, outputUsdPer1M required" });
      }
      const row = await databaseStorage.upsertAiModelPricing(provider, modelId, inputUsdPer1M, outputUsdPer1M);
      res.status(200).json({
        id: row.id,
        provider: row.provider,
        modelId: row.modelId,
        inputUsdPer1M: row.inputUsdPer1M != null ? String(row.inputUsdPer1M) : "0",
        outputUsdPer1M: row.outputUsdPer1M != null ? String(row.outputUsdPer1M) : "0",
        updatedAt: row.updatedAt != null ? (typeof row.updatedAt === "string" ? row.updatedAt : new Date(row.updatedAt).toISOString()) : null,
      });
    } catch (err) {
      console.error("Admin pricing upsert error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to save pricing" });
    }
  });

  app.get("/health/detailed", async (req, res) => {
    try {
      // Check database connection
      const dbCheck = await databaseStorage.getDatabaseHealth();

      // Check external services
      const services = {
        database: dbCheck,
        github: "unknown", // Could add actual GitHub API check
        slack: "unknown",  // Could add actual Slack API check
        stripe: "unknown"  // Could add actual Stripe API check
      };

      const isHealthy = dbCheck === "healthy";

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services
      });
    } catch (error) {
      Sentry.captureException(error);
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Incident engine health check (useful for monitoring and debugging)
  app.get("/api/health/incident-engine", (req, res) => {
    try {
      const status = getIncidentEngineStatus();
      const queueUtilization = (status.queuedEvents / status.maxQueueSize * 100).toFixed(1);
      const isHealthy = status.running && status.queuedEvents < status.maxQueueSize * 0.9; // Warn if queue >90% full

      const payload = {
        status: isHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        engine: {
          running: status.running,
          queuedEvents: status.queuedEvents,
          queueCapacity: status.maxQueueSize,
          queueUtilization: `${queueUtilization}%`,
        },
        message: !status.running
          ? "Incident engine is not running"
          : status.queuedEvents >= status.maxQueueSize * 0.9
          ? "Queue utilization is high - incident engine may be struggling"
          : "Incident engine is healthy"
      };
      res.setHeader("Content-Type", "application/json");
      res.status(isHealthy ? 200 : 503).send(JSON.stringify(payload) + "\n");
    } catch (error) {
      Sentry.captureException(error);
      const payload = {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Failed to check incident engine status"
      };
      res.setHeader("Content-Type", "application/json");
      res.status(503).send(JSON.stringify(payload) + "\n");
    }
  });

  // Login route
  app.post("/api/login", [
    body('identifier').trim().isLength({ min: 1 }).withMessage('Email/username is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required')
  ], async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: errors.array() 
        });
      }

      const { identifier, password } = req.body;

      // AUTH-VULN-11/12: Per-account lockout (DB-backed, shared across instances)
      const { locked, retryAfterSeconds } = await databaseStorage.getLoginLockout(identifier);
      if (locked) {
        if (retryAfterSeconds > 0) {
          res.setHeader("Retry-After", String(retryAfterSeconds));
        }
        // 423 Locked = account lockout (distinct from 429 = IP rate limit). Message uses "locked"
        // so security tests (AUTH-VULN-12) and clients recognize account lockout.
        return res.status(423).json({
          error: "Account temporarily locked due to repeated failed login attempts. Try again after the lockout period.",
          retryAfterSeconds,
          accountLocked: true,
        });
      }

      // Try to find user by email or username
      let user = await databaseStorage.getUserByEmail(identifier);
      if (!user) {
        user = await databaseStorage.getUserByUsername(identifier);
      }

      if (!user) {
        await databaseStorage.recordLoginFailedAttempt(identifier);
        return res.status(401).send("Invalid email/username or password");
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password || '');
      if (!passwordMatch) {
        await databaseStorage.recordLoginFailedAttempt(identifier);
        return res.status(401).send("Invalid email/username or password");
      }

      await databaseStorage.clearLoginAttempts(identifier);

      const userWithMfa = user as { mfaEnabled?: boolean };
      const needsMfa = !!(userWithMfa.mfaEnabled ?? (user as any).mfa_enabled);

      if (needsMfa) {
        (req.session as any).userId = user.id;
        (req.session as any).mfaPending = true;
        (req.session as any).mfaSetupRequired = false;
        (req.session as any).user = {
          userId: user.id,
          username: user.username || '',
          email: user.email || null,
          githubConnected: !!user.githubId,
          googleConnected: !!user.googleId,
          emailVerified: !!user.emailVerified,
        };
        req.session.userId = user.id;
        req.session.save((err) => {
          if (err) {
            console.error("Login session save error:", err);
            return res.status(500).json({ error: "Failed to create session" });
          }
          return res.status(200).json({ success: true, needsMfaVerify: true, redirectTo: "/verify-mfa" });
        });
        return;
      }

      // Set session data (no MFA required)
      req.session.userId = user.id;
      const sessionWithOrg = await getSessionUserWithOrg(user);
      req.session.user = sessionWithOrg ?? {
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: !!user.githubId,
        googleConnected: !!user.googleId,
        emailVerified: !!user.emailVerified,
        organizationId: (user as any).organizationId ?? '',
        role: 'viewer' as const,
      };
      req.session.userId = user.id;
      
      // Save session explicitly to ensure cookie is set
      req.session.save((err) => {
        if (err) {
          console.error('❌ Error saving session:', err);
          Sentry.captureException(err);
          return res.status(500).json({ error: 'Failed to create session' });
        }

        // Verify cookie was set
        const cookieHeader = res.getHeader('Set-Cookie');
        if (!cookieHeader) {
          console.error('❌ WARNING: Session cookie was not set in response!');
        }

        // Debug logging
        if (process.env.NODE_ENV !== 'production') {
          console.log('✅ Session created:', {
            userId: user.id,
            sessionId: req.session.id,
            cookieSet: cookieHeader ? 'yes' : 'no',
            cookieValue: cookieHeader ? String(cookieHeader).substring(0, 50) + '...' : 'none'
          });
        }

        // No token needed - cookie is set automatically by Express
        res.status(200).json({
          success: true,
          // No token in response - client doesn't need it
          user: {
            id: user.id,
            username: user.username || '',
            email: user.email || null,
            isUsernameSet: true,
            emailVerified: !!user.emailVerified,
            githubConnected: !!user.githubId
          }
        });
      });
    } catch (error) {
      Sentry.captureException(error);
      res.status(500).send("An error occurred while trying to log in");
    }
  });

  // MFA setup (new users) — requires mfaPending + mfaSetupRequired session
  app.get("/api/mfa/setup", requireMfaPendingSession, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const user = await databaseStorage.getUserById(userId);
      if ((user as any)?.mfaEnabled) return res.status(400).json({ error: "MFA already set up." });
      // Reuse existing secret if present (avoids overwriting on double-mount/refetch so scanned QR matches POST)
      let secretBase32 = (req.session as any).mfaSetupSecret as string | undefined;
      if (!secretBase32) {
        const gen = speakeasy.generateSecret({ name: `PushLog (${user?.username || userId.slice(0, 8)})`, length: 20 });
        secretBase32 = gen.base32;
        (req.session as any).mfaSetupSecret = secretBase32;
        await new Promise<void>((resolve, reject) => req.session!.save((err) => (err ? reject(err) : resolve())));
      }
      const label = `PushLog:${user?.username || user?.email || userId}`;
      const otpauth = `otpauth://totp/${encodeURIComponent(label)}?secret=${secretBase32}&issuer=PushLog`;
      const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 200, margin: 2 });
      res.status(200).json({ qrDataUrl, secretBase32 });
    } catch (err) {
      console.error("MFA setup error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to generate MFA setup" });
    }
  });

  app.post("/api/mfa/setup", requireMfaPendingSession, body("code").trim().isLength({ min: 6, max: 6 }), async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: "Invalid code" });
      const code = req.body.code as string;
      const secret = (req.session as any).mfaSetupSecret;
      if (!secret) return res.status(400).json({ error: "Setup session expired. Refresh the page." });
      const valid = speakeasy.totp.verify({ secret, encoding: "base32", token: code, window: 2 });
      if (!valid) return res.status(401).json({ error: "Invalid code. Please try again." });
      const userId = req.session!.userId!;
      const encrypted = encrypt(secret);
      await databaseStorage.updateUser(userId, { totpSecret: encrypted, mfaEnabled: true } as any);
      delete (req.session as any).mfaPending;
      delete (req.session as any).mfaSetupRequired;
      delete (req.session as any).mfaSetupSecret;
      await new Promise<void>((resolve, reject) => req.session!.save((err) => (err ? reject(err) : resolve())));
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("MFA setup verify error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to save MFA" });
    }
  });

  // MFA verify (login) — requires mfaPending session
  app.post("/api/mfa/verify", requireMfaPendingSession, body("code").trim().isLength({ min: 6, max: 6 }), async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: "Invalid code" });
      const code = req.body.code as string;
      const userId = req.session!.userId!;
      const user = await databaseStorage.getUserById(userId);
      if (!user) return res.status(404).json({ error: "User not found.", code: "user_not_found" });
      const rawSecret = (user as any)?.totpSecret ? decrypt((user as any).totpSecret) : null;
      if (!rawSecret) return res.status(401).json({ error: "MFA not configured. Please contact support.", code: "mfa_not_configured" });
      const valid = speakeasy.totp.verify({ secret: rawSecret, encoding: "base32", token: code, window: 2 });
      if (!valid) return res.status(401).json({ error: "Invalid code. Please try again.", code: "invalid_code" });
      delete (req.session as any).mfaPending;
      delete (req.session as any).mfaSetupRequired;
      await new Promise<void>((resolve, reject) => req.session!.save((err) => (err ? reject(err) : resolve())));
      // Return profile so client can set cache and navigate immediately (no extra GET /api/profile round trip)
      const profileUser = {
        id: user.id,
        username: user.username || "",
        email: user.email || null,
        isUsernameSet: !!user.username,
        emailVerified: !!(user as any).emailVerified,
        githubConnected: !!user.githubId,
        googleConnected: !!user.googleId,
        aiCredits: (user as any).aiCredits ?? 0,
        hasOpenRouterKey: !!((user as any).openRouterApiKey),
        hasOpenAiKey: !!((user as any).openaiApiKey),
        monthlyBudget: (user as any).monthlyBudget ?? null,
        overBudgetBehavior: (user as any).overBudgetBehavior === "free_model" ? "free_model" as const : "skip_ai" as const,
        preferredAiModel: (user as any).preferredAiModel ?? "gpt-5.2",
        devMode: !!((user as any).devMode),
        incidentEmailEnabled: (user as any).incidentEmailEnabled !== false,
        receiveIncidentNotifications: (user as any).receiveIncidentNotifications !== false,
      };
      res.status(200).json({ success: true, user: profileUser });
    } catch (err) {
      console.error("MFA verify error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  // Add GitHub connection initiation endpoint
  app.get("/api/github/connect", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      // User will be available from authenticateToken middleware
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ 
          error: "Authentication required",
          redirectTo: "/login"
        });
      }

      // Check if user already has GitHub connected and validate the token
      const user = await databaseStorage.getUserById(userId);
      if (user?.githubId && user?.githubToken) {
        try {
          const isValid = await validateGitHubToken(user.githubToken);
          if (isValid) {
            // Check if token has the 'repo' scope
            const scopes = await getGitHubTokenScopes(user.githubToken);
            const hasRepoScope = scopes.includes("repo");
            
            if (hasRepoScope) {
              // Token is valid and has repo scope, already connected properly
              return res.status(400).json({
                error: "GitHub account already connected"
              });
            } else {
              // Token is valid but missing repo scope, clear and allow reconnection
              await databaseStorage.updateUser(userId, {
                githubId: null,
                githubToken: null
              });
            }
          } else {
            // Token is invalid, clear the connection and allow reconnection
            await databaseStorage.updateUser(userId, {
              githubId: null,
              githubToken: null
            });
          }
        } catch (error) {
          console.error('GitHub token validation error:', error);
          // Clear invalid connection and allow reconnection
          await databaseStorage.updateUser(userId, {
            githubId: null,
            githubToken: null
          });
        }
      }

      // Generate state for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');
      
      // Store the state and user ID in a temporary session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await databaseStorage.storeOAuthSession({
        token: sessionToken,
        state,
        userId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      });

      // Build the GitHub OAuth URL (use OAuth App, not GitHub App)
      const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID || "Ov23li5UgB18JcaZHnxk";
      const redirectUri = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, "")}/auth/github/callback` : "https://pushlog.ai/auth/github/callback";
      const scope = "repo user:email admin:org_hook";
      
      const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
      
      // Instead of redirecting, send the URL and state back to the client
      res.status(200).json({ url, state });
    } catch (error) {
      console.error('GitHub connection initiation failed:', error);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Failed to initiate GitHub connection' });
    }
  });

  // Disconnect GitHub account
  app.post("/api/github/disconnect", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Clear GitHub connection
      await databaseStorage.updateUser(userId, {
        githubId: null,
        githubToken: null
      });

      res.status(200).json({ success: true, message: "GitHub account disconnected successfully" });
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Failed to disconnect GitHub account' });
    }
  });

  // Public config for OAuth (client ID only; secret stays on server). Lets staging use a different GitHub OAuth app.
  app.get("/api/auth/config", (_req, res) => {
    const fromEnv = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
    const githubClientId = fromEnv || "Ov23li5UgB18JcaZHnxk";
    const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || undefined;
    res.status(200).json({
      githubClientId,
      googleClientId: googleClientId || null,
      // Debug: "env" = using own OAuth app; "default" = prod client id (check GITHUB_OAUTH_CLIENT_ID in .env.staging)
      githubClientIdSource: fromEnv ? "env" : "default",
    });
  });

  // Init GitHub OAuth for login — stores state server-side, redirects to GitHub. User returns to GET /auth/github/callback.
  app.get("/api/auth/github/init", (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    const rawReturn = (req.query.returnPath as string) || "/dashboard";
    const safeReturn = rawReturn.startsWith("/") && !rawReturn.includes("..") ? rawReturn : "/dashboard";
    const { clientId, redirectUri } = getGitHubOAuthConfig(req.get("host") || undefined);
    const stateHex = crypto.randomBytes(32).toString("hex");
    const state = `${stateHex}:${Buffer.from(safeReturn, "utf8").toString("base64url")}`;
    databaseStorage.storeOAuthSession({
      token: crypto.randomBytes(16).toString("hex"),
      state,
      userId: "__login__",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const scope = "repo user:email admin:org_hook";
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}`;
    res.redirect(302, url);
  });

  // GET /auth/github/callback is NOT handled here — it falls through to the SPA. GitHub redirects there,
  // the React GitHubCallback component loads and auto-POSTs to POST /api/auth/github/exchange.
  // The POST flow sets the session cookie in a same-origin response (user is already on our domain),
  // which avoids Set-Cookie being dropped when coming from a cross-site redirect (GitHub → us).

  // GET /api/auth/github/exchange — not used; redirect so users never see raw API/JSON when opening the URL.
  app.get("/api/auth/github/exchange", (_req, res) => {
    res.redirect(302, "/login");
  });

  // POST GitHub OAuth exchange — client callback page POSTs here. Sets session, redirects to setup/verify-mfa.
  // Client lands on /auth/github/callback?code=...&state=..., then POSTs here. Redirect URI must match the authorize request.
  app.post("/api/auth/github/exchange", async (req, res) => {
    const loginRedirectWithError = (message: string) => {
      const host = (req.get("host") || "").split(":")[0];
      const protocol = host === "pushlog.ai" ? "https" : (req.protocol || "https");
      const base = host ? `${protocol}://${host}` : (process.env.APP_URL || "").replace(/\/$/, "") || "";
      const url = base ? `${base}/login?error=${encodeURIComponent(message)}` : `/login?error=${encodeURIComponent(message)}`;
      res.redirect(302, url);
    };
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    try {
      const { code, state, redirectUri: clientRedirectUri, returnPath } = req.body || {};
      if (!code || typeof code !== "string") {
        return loginRedirectWithError( "Missing authorization code. Please try logging in again.");
      }
      const redirectUri = typeof clientRedirectUri === "string" && clientRedirectUri.startsWith("https://")
        ? clientRedirectUri
        : (req.get("host") ? `${req.protocol || "https"}://${req.get("host")}/auth/github/callback` : undefined);
      const host = (req.get("host") || "").split(":")[0];
      let token: string;
      try {
        token = await exchangeCodeForToken(code, redirectUri, req.get("host") || undefined);
      } catch (tokenError) {
        console.error("Failed to exchange code for token:", tokenError);
        return loginRedirectWithError( "Token exchange failed. Please try again.");
      }
      let githubUser;
      try {
        githubUser = await getGitHubUser(token);
      } catch (userError) {
        console.error("Failed to get GitHub user:", userError);
        return loginRedirectWithError( "Could not load your GitHub account. Please try again.");
      }
      const currentUserId = state ? await getUserIdFromOAuthState(state) : null;
      const isLinkingFlow = !!(currentUserId && currentUserId !== "__login__");
      let user: import("@shared/schema").User;
      let isNewUser: boolean;
      try {
        const result = await findOrCreateUserFromOAuth({
          provider: "github",
          providerAccountId: githubUser.id.toString(),
          email: githubUser.email ?? null,
          emailVerified: Boolean((githubUser as { emailVerified?: boolean }).emailVerified),
          suggestedUsername: githubUser.login,
          token,
          isLinkingFlow,
          currentUserId: currentUserId ?? null,
        });
        user = result.user;
        isNewUser = result.isNewUser;
      } catch (linkError: any) {
        console.error("GitHub OAuth findOrCreate error:", linkError);
        return loginRedirectWithError( linkError?.message ?? "Could not sign in. Please try again.");
      }
      if (!user?.id) {
        return loginRedirectWithError( "Something went wrong. Please try again.");
      }
      const userForMfa = user as { mfaEnabled?: boolean };
      const hasMfa = !!(userForMfa.mfaEnabled ?? (user as any).mfa_enabled);
      req.session!.regenerate((regErr) => {
        if (regErr) {
          console.error("❌ GitHub OAuth: session regenerate failed:", regErr);
          Sentry.captureException(regErr);
          return loginRedirectWithError( "Session error. Please try again.");
        }
        req.session!.userId = user.id;
        req.session!.user = {
          userId: user.id,
          username: user.username || "",
          email: user.email || null,
          githubConnected: true,
          googleConnected: !!user.googleId,
          emailVerified: !!(user as any).emailVerified,
          organizationId: (user as any).organizationId ?? "",
          role: "viewer",
        };
        if (!isLinkingFlow) {
          (req.session as any).mfaPending = true;
          (req.session as any).mfaSetupRequired = !hasMfa;
        }
        req.session!.save((err) => {
          if (err) {
            console.error("❌ GitHub OAuth: session save failed:", err);
            Sentry.captureException(err);
            return loginRedirectWithError( "Session error. Please try again.");
          }
          const targetPath = isLinkingFlow
            ? "/dashboard?github_connected=1"
            : (hasMfa ? "/verify-mfa" : "/setup-mfa");
          const host = (req.get("host") || "").split(":")[0];
          const protocol = host === "pushlog.ai" ? "https" : (req.protocol || "https");
          const base = host ? `${protocol}://${host}` : (process.env.APP_URL || "").replace(/\/$/, "") || "";
          const redirectUrl = base ? `${base}${targetPath}` : targetPath;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.status(200).send(
            `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${redirectUrl}"></head>` +
            `<body><p>Redirecting...</p><script>location.href=${JSON.stringify(redirectUrl)}</script></body></html>`
          );
        });
      });
    } catch (error) {
      console.error("GitHub OAuth exchange error:", error);
      Sentry.captureException(error);
      return loginRedirectWithError( "Something went wrong. Please try again.");
    }
  });

  // Get current user info or handle GitHub OAuth
  app.get("/api/auth/user", async (req, res) => {
    // Prevent caching — OAuth callback must hit origin; cached JSON causes users to see raw API response instead of redirect
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    try {
      // Check if this is a GitHub OAuth callback
      const code = req.query.code as string;
      const error = req.query.error as string;
      
      if (error) {
        console.error("GitHub OAuth error from callback:", error, req.query.error_description);
        const message = error === "access_denied" ? "Sign-in was cancelled." : "GitHub sign-in failed. Please try again.";
        return res.redirect(`/login?error=${encodeURIComponent(message)}`);
      }
      
      if (code) {
        // Use the request's Host so redirect_uri always matches where the user was sent (ignore APP_URL which may be wrong on server).
        const host = (req.get("host") || "").split(":")[0];
        const protocol = host === "pushlog.ai" ? "https" : (req.protocol || "https");
        const redirectUriForExchange = host ? `${protocol}://${host}/api/auth/user` : (process.env.APP_URL ? `${(process.env.APP_URL || "").replace(/\/$/, "")}/api/auth/user` : undefined);
        let token: string;
        try {
          token = await exchangeCodeForToken(code, redirectUriForExchange, req.get("host") || undefined);
        } catch (tokenError) {
          console.error("Failed to exchange code for token:", tokenError);
          throw new Error(`Failed to exchange GitHub authorization code: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
        }
        
        let githubUser;
        try {
          githubUser = await getGitHubUser(token);
        } catch (userError) {
          console.error("Failed to get GitHub user:", userError);
          throw new Error(`Failed to fetch GitHub user info: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
        }

        const state = req.query.state as string;
        const currentUserId = state ? await getUserIdFromOAuthState(state) : null;
        const isLinkingFlow = !!(currentUserId && currentUserId !== "__login__");

        let user: import("@shared/schema").User;
        let isNewUser: boolean;
        try {
          const result = await findOrCreateUserFromOAuth({
            provider: "github",
            providerAccountId: githubUser.id.toString(),
            email: githubUser.email ?? null,
            emailVerified: Boolean((githubUser as { emailVerified?: boolean }).emailVerified),
            suggestedUsername: githubUser.login,
            token,
            isLinkingFlow,
            currentUserId: currentUserId ?? null,
          });
          user = result.user;
          isNewUser = result.isNewUser;
        } catch (linkError: any) {
          console.error("GitHub OAuth findOrCreate error:", linkError);
          const msg = linkError?.message ?? "Could not sign in. Please try again.";
          return res.redirect(`/login?error=${encodeURIComponent(msg)}`);
        }

        if (!user?.id) {
          return res.redirect(`/login?error=${encodeURIComponent("Something went wrong. Please try again.")}`);
        }

        const hasMfa = !!(user as { mfaEnabled?: boolean }).mfaEnabled;

        req.session.userId = user.id;
        const sessionWithOrg = await getSessionUserWithOrg(user);
        req.session.user = sessionWithOrg ?? {
          userId: user.id,
          username: user.username || '',
          email: user.email || null,
          githubConnected: true,
          googleConnected: !!user.googleId,
          emailVerified: !!(user as any).emailVerified,
          organizationId: (user as any).organizationId ?? '',
          role: 'viewer' as const,
        };
        if (!isLinkingFlow) {
          (req.session as any).mfaPending = true;
          (req.session as any).mfaSetupRequired = !hasMfa;
        }

        const redirectHost = (req.get("host") || "").split(":")[0];
        const redirectProtocol = redirectHost === "pushlog.ai" ? "https" : (req.protocol || "https");
        const base = redirectHost ? `${redirectProtocol}://${redirectHost}` : (process.env.APP_URL || "").replace(/\/$/, "") || "";
        const path = isLinkingFlow ? "/dashboard?github_connected=1" : (hasMfa ? "/verify-mfa" : "/setup-mfa");
        const redirectUrl = base ? `${base}${path}` : path;

        req.session.save((err) => {
          if (err) {
            console.error("❌ GitHub OAuth: session save failed:", err);
            return res.redirect(`/login?error=${encodeURIComponent("Session error. Please try again.")}`);
          }
          return res.redirect(redirectUrl);
        });
      }

      // If no code, this is a regular user info request (uses session auth)
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await databaseStorage.getUserById(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username || '',
          email: user.email || null,
          isUsernameSet: !!user.username,
          emailVerified: !!user.emailVerified,
          githubConnected: !!user.githubId,
          googleConnected: !!user.googleId
        }
      });
    } catch (error) {
      console.error("Auth error:", error);
      const errorMessage = error instanceof Error ? error.message : "Authentication failed";
      // Redirect to login with error message instead of returning JSON
      const redirectUrl = `/login?error=${encodeURIComponent(errorMessage)}`;
      return res.redirect(redirectUrl);
    }
  });

  // Add Google OAuth callback route — sign-in-or-sign-up via oauth_identities
  app.get("/api/google/user", async (req, res) => {
    const loginRedirectWithError = (message: string) => {
      const host = (req.get("host") || "").split(":")[0];
      const protocol = host === "pushlog.ai" ? "https" : (req.protocol || "https");
      const base = host ? `${protocol}://${host}` : (process.env.APP_URL || "").replace(/\/$/, "") || "";
      res.redirect(302, base ? `${base}/login?error=${encodeURIComponent(message)}` : `/login?error=${encodeURIComponent(message)}`);
    };
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    try {
      const code = req.query.code as string;
      if (!code) {
        return loginRedirectWithError("Missing authorization code. Please try again.");
      }
      const token = await exchangeGoogleCodeForToken(code);
      const googleUser = await getGoogleUser(token);

      const suggestedUsername = googleUser.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30) || "user";
      let user: import("@shared/schema").User;
      let isNewUser: boolean;
      try {
        const result = await findOrCreateUserFromOAuth({
          provider: "google",
          providerAccountId: googleUser.id,
          email: googleUser.email,
          emailVerified: !!googleUser.verified_email,
          suggestedUsername,
          token,
          isLinkingFlow: false,
          currentUserId: null,
        });
        user = result.user;
        isNewUser = result.isNewUser;
      } catch (linkError: any) {
        console.error("Google OAuth findOrCreate error:", linkError);
        return loginRedirectWithError(linkError?.message ?? "Could not sign in. Please try again.");
      }

      if (!user?.id) {
        return loginRedirectWithError("Something went wrong. Please try again.");
      }

      const hasMfa = !!(user as { mfaEnabled?: boolean }).mfaEnabled || !!(user as any).mfa_enabled;

      req.session.userId = user.id;
      const sessionWithOrg = await getSessionUserWithOrg(user);
      req.session.user = sessionWithOrg ?? {
        userId: user.id,
        username: user.username || "",
        email: user.email || null,
        githubConnected: !!user.githubId,
        googleConnected: true,
        emailVerified: !!(user as any).emailVerified,
        organizationId: (user as any).organizationId ?? "",
        role: "viewer" as const,
      };
      (req.session as any).mfaPending = true;
      (req.session as any).mfaSetupRequired = !hasMfa;

      const targetPath = hasMfa ? "/verify-mfa" : "/setup-mfa";
      const host = (req.get("host") || "").split(":")[0];
      const protocol = host === "pushlog.ai" ? "https" : (req.protocol || "https");
      const base = host ? `${protocol}://${host}` : (process.env.APP_URL || "").replace(/\/$/, "") || "";
      const redirectUrl = base ? `${base}${targetPath}` : targetPath;
      req.session.save((err) => {
        if (err) {
          console.error("Google OAuth: session save failed:", err);
          Sentry.captureException(err);
          return loginRedirectWithError("Session error. Please try again.");
        }
        res.redirect(redirectUrl);
      });
    } catch (error) {
      console.error("Google auth error:", error);
      Sentry.captureException(error);
      loginRedirectWithError(error instanceof Error ? error.message : "Authentication failed");
    }
  });

  // Create signup for user and create user
  app.post("/api/signup", [
    body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  ], async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: errors.array() 
        });
      }

      const { username, email, password } = req.body;

      const passwordError = validatePasswordRequirements(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }

      // AUTH-VULN-20: Use one generic message for both conflicts so we don't leak
      // whether email or username is already in use (prevents user enumeration).
      const existingUsername = await databaseStorage.getUserByUsername(username);
      const existingEmail = await databaseStorage.getUserByEmail(email);
      if (existingUsername || existingEmail) {
        return res.status(400).json({
          error: "Registration failed. Please try a different email or username, or sign in if you already have an account.",
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      // Create user with hashed password and verification token
      const user = await databaseStorage.createUser({
        username,
        email,
        password: hashedPassword,
        emailVerified: false,
        verificationToken,
        verificationTokenExpiry,
      });

      // Send verification email
      await sendVerificationEmail(email, verificationToken);
      req.session.userId = user.id;
      (req.session as any).mfaPending = true;
      (req.session as any).mfaSetupRequired = true;
      const sessionWithOrg = await getSessionUserWithOrg(user);
      req.session.user = sessionWithOrg ?? {
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: false,
        googleConnected: false,
        emailVerified: false,
        organizationId: (user as any).organizationId ?? '',
        role: 'viewer' as const,
      };

      await new Promise<void>((resolve, reject) => {
        req.session!.save((err) => (err ? reject(err) : resolve()));
      });

      res.status(200).json({
        success: true,
        needsMfaSetup: true,
        redirectTo: "/setup-mfa",
        user: {
          id: user.id,
          username: user.username || '',
          email: user.email || null,
          isUsernameSet: true,
          emailVerified: false,
          githubConnected: false
        }
      });
    } catch (error) {
      Sentry.captureException(error);
      res.status(500).send("Failed to create account");
    }
  });

  // Add email verification endpoint
  app.get("/api/verify-email", async (req, res) => {
    try {
      const verificationToken = req.query.token as string;

      if (!verificationToken) {
        return res.status(400).json({ error: "Verification token is required" });
      }

      // Find user by verification token
      const user = await databaseStorage.getUserByVerificationToken(verificationToken);

      if (!user) {
        return res.status(400).json({ error: "Invalid verification token" });
      }

      // Check if token is expired
      if (user.verificationTokenExpiry && new Date(user.verificationTokenExpiry) < new Date()) {
        return res.status(400).json({ error: "Verification token has expired" });
      }

      // Update user as verified
      await databaseStorage.updateUser(user.id, {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null
      });

      // Remove any existing email verification notifications
      try {
        const existingNotifications = await storage.getNotificationsByUserId(user.id, { limit: 500 });
        const emailVerificationNotifications = existingNotifications.filter(n => n.type === 'email_verification');
        
        for (const notification of emailVerificationNotifications) {
          await storage.deleteNotification(notification.id);
        }
      } catch (notificationError) {
        console.error("Error removing email verification notifications:", notificationError);
        // Don't fail the verification process if notification cleanup fails
      }

      req.session.userId = user.id;
      const sessionWithOrg = await getSessionUserWithOrg(user);
      req.session.user = sessionWithOrg ?? {
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: !!user.githubId,
        googleConnected: !!user.googleId,
        emailVerified: true,
        organizationId: (user as any).organizationId ?? '',
        role: 'viewer' as const,
      };

      res.status(200).json({
        success: true,
        // No token needed - session is set/updated automatically
        message: "Email verified successfully"
      });
    } catch (error) {
      console.error("Email verification error:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // Resend verification email
  app.post("/api/resend-verification", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (user.emailVerified) {
        return res.status(200).json({ success: true, alreadyVerified: true, message: "Email is already verified." });
      }
      if (!user.email) {
        return res.status(400).json({ error: "No email address associated with account" });
      }

      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Update user with new verification token
      await databaseStorage.updateUser(userId, {
        verificationToken,
        verificationTokenExpiry: verificationTokenExpiry.toISOString()
      });

      // Send verification email
      await sendVerificationEmail(user?.email ?? '', verificationToken);

      // Create notification for resend email
      let notification;
      try {
        const notificationData = {
          userId,
          type: 'email_verification',
          title: 'Verification Email Resent',
          message: 'A new verification email has been sent to your inbox.'
        };
        notification = await storage.createNotification(notificationData);
      } catch (error) {
        console.error('Error creating notification:', error);
        Sentry.captureException(error);
        return res.status(500).json({ error: "Failed to create notification" });
      }

      // Broadcast the notification via SSE for real-time updates
      broadcastNotification(userId, notification);

      res.status(200).json({
        success: true,
        message: "Verification email sent successfully"
      });
    } catch (error) {
      console.error("Resend verification error:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to send verification email" });
    }
  });

  app.post("/api/logout", async (req, res) => {
    // Capture session ID before any async work; req.sessionID is what's stored in DB.
    const sessionId = req.sessionID;

    const doLogout = () => {
      clearLogoutCookie(res);
      res.status(200).json({ success: true, message: "Logged out successfully" });
    };

    // AUTH-VULN-03: Delete the session row FIRST so it's gone before we respond.
    // Then destroy the in-memory session. This guarantees the cookie cannot be reused.
    try {
      if (sessionId) {
        await databaseStorage.deleteUserSession(sessionId);
      }
    } catch (e) {
      console.error("Failed to delete session from DB on logout:", e);
    }

    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error on logout:", err);
      }
      doLogout();
    });
  });

  /**
   * Clear the session cookie with options that MUST match the cookie set at login
   * (server/index.ts session config). Mismatch (e.g. sameSite) can prevent the browser
   * from clearing the cookie (AUTH-VULN-03). Uses sameSite: "none" to match session config.
   */
  function clearLogoutCookie(res: Response): void {
    const opts: Parameters<Response["clearCookie"]>[1] = {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "none",
    };
    if (process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
    res.clearCookie("connect.sid", opts);
  }

  // --- Org invite (share link + accept) ---
  app.get("/api/org", authenticateToken, requireOrgMember, async (req: Request, res: Response) => {
    try {
      const orgId = (req as any).orgId as string;
      const org = await databaseStorage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Organization not found" });
      const members = await databaseStorage.getOrganizationMembers(orgId);
      const memberCount = members.length;
      let isDefaultOrgName = false;
      const ownerId = (org as any).ownerId;
      if (ownerId && memberCount > 0) {
        const owner = await databaseStorage.getUserById(ownerId);
        const ownerLabel = (owner?.username || owner?.email || "My PushLog").toString().trim() || "My PushLog";
        const defaultName = `${ownerLabel}'s workspace`;
        isDefaultOrgName = (org as any).name === defaultName;
      }
      res.status(200).json({
        id: org.id,
        name: (org as any).name,
        domain: (org as any).domain ?? null,
        type: (org as any).type,
        memberCount,
        isDefaultOrgName,
      });
    } catch (e) {
      console.error("Get org error:", e);
      Sentry.captureException(e);
      res.status(500).json({ error: "Failed to load organization" });
    }
  });

  app.get("/api/org/members", authenticateToken, requireOrgMember, async (req: Request, res: Response) => {
    try {
      const orgId = (req as any).orgId as string;
      const members = await databaseStorage.getOrganizationMembersWithUsers(orgId);
      res.status(200).json({ members });
    } catch (e) {
      console.error("Get org members error:", e);
      Sentry.captureException(e);
      res.status(500).json({ error: "Failed to load organization members" });
    }
  });

  /** Remove a member from the organization (revoke access only; does not delete their account). */
  app.delete(
    "/api/org/members/:userId",
    authenticateToken,
    requireOrgMember,
    requireOrgRole(["owner", "admin"]),
    async (req: Request, res: Response) => {
      try {
        const orgId = (req as any).orgId as string;
        const userIdToRemove = String(req.params.userId).trim();
        if (!userIdToRemove) return res.status(400).json({ error: "userId is required" });
        const actorRole = (req.user as any)?.role ?? "viewer";
        const result = await databaseStorage.removeOrganizationMember(orgId, userIdToRemove, actorRole);
        if (!result.ok) {
          return res.status(400).json({ error: result.error || "Cannot remove member" });
        }
        res.status(200).json({ success: true, message: "Member removed from organization" });
      } catch (e) {
        console.error("Remove org member error:", e);
        Sentry.captureException(e);
        res.status(500).json({ error: "Failed to remove member" });
      }
    }
  );

  /** Update a member's role (e.g. developer → admin). */
  app.patch(
    "/api/org/members/:userId",
    authenticateToken,
    requireOrgMember,
    requireOrgRole(["owner", "admin"]),
    body("role").isIn(["owner", "admin", "developer", "viewer"]),
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: "Validation failed", details: errors.array() });
        }
        const orgId = (req as any).orgId as string;
        const userId = String(req.params.userId).trim();
        const newRole = String(req.body?.role);
        if (!userId) return res.status(400).json({ error: "userId is required" });
        const actorRole = (req.user as any)?.role ?? "viewer";
        const result = await databaseStorage.updateOrganizationMemberRole(orgId, userId, newRole, actorRole);
        if (!result.ok) {
          return res.status(400).json({ error: result.error || "Cannot update role" });
        }
        res.status(200).json({ success: true, message: "Role updated" });
      } catch (e) {
        console.error("Update org member role error:", e);
        Sentry.captureException(e);
        res.status(500).json({ error: "Failed to update role" });
      }
    }
  );

  app.patch(
    "/api/org",
    authenticateToken,
    requireOrgMember,
    requireOrgRole(["owner", "admin"]),
    body("name").optional().trim().isLength({ min: 1, max: 60 }),
    body("domain").optional().trim(),
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: "Validation failed", details: errors.array() });
        }
        const orgId = (req as any).orgId as string;
        const updates: { name?: string; domain?: string | null } = {};
        if (typeof req.body?.name === "string" && req.body.name.trim()) {
          updates.name = req.body.name.trim();
        }
        if (req.body?.domain !== undefined) {
          let domain = typeof req.body.domain === "string" ? req.body.domain.trim().toLowerCase() : "";
          if (domain) {
            domain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "").split("/")[0] ?? "";
            const domainRegex = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;
            if (!domainRegex.test(domain)) {
              return res.status(400).json({ error: "Invalid domain. Use a format like acme.com" });
            }
          }
          updates.domain = domain || null;
        }
        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: "No valid updates" });
        }
        await databaseStorage.updateOrganization(orgId, updates);
        const org = await databaseStorage.getOrganization(orgId);
        res.status(200).json({
          success: true,
          org: org ? { id: org.id, name: (org as any).name, domain: (org as any).domain ?? null } : undefined,
        });
      } catch (e) {
        console.error("Update org error:", e);
        Sentry.captureException(e);
        res.status(500).json({ error: "Failed to update organization" });
      }
    }
  );

  app.post(
    "/api/org/invites/link",
    authenticateToken,
    requireOrgMember,
    requireOrgRole(["owner", "admin"]),
    body("role").optional().isIn(["owner", "admin", "developer", "viewer"]),
    body("expiresInDays").optional().isInt({ min: 1, max: 365 }),
    async (req: Request, res: Response) => {
      try {
        const orgId = (req as any).orgId as string;
        const createdByUserId = req.user!.userId;
        const role = (req.body?.role as string) || "developer";
        const expiresInDays = Math.min(365, Math.max(1, parseInt(String(req.body?.expiresInDays || 7), 10) || 7));
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
        const { rawToken, joinUrl } = await databaseStorage.createOrganizationInviteLink(orgId, role, expiresAt, createdByUserId);
        res.status(201).json({ joinUrl, expiresAt: expiresAt.toISOString(), role });
      } catch (e) {
        console.error("Create org invite link error:", e);
        Sentry.captureException(e);
        res.status(500).json({ error: "Failed to create invite link" });
      }
    }
  );

  app.post(
    "/api/org/invites/email",
    authenticateToken,
    requireOrgMember,
    requireOrgRole(["owner", "admin"]),
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("role").optional().isIn(["owner", "admin", "developer", "viewer"]),
    body("expiresInDays").optional().isInt({ min: 1, max: 365 }),
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: "Validation failed", details: errors.array() });
        }
        const orgId = (req as any).orgId as string;
        const createdByUserId = req.user!.userId;
        const email = String(req.body.email).trim().toLowerCase();
        const role = (req.body?.role as string) || "developer";
        const expiresInDays = Math.min(365, Math.max(1, parseInt(String(req.body?.expiresInDays || 7), 10) || 7));
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
        const { joinUrl } = await databaseStorage.createOrganizationInviteEmail(orgId, email, role, expiresAt, createdByUserId);
        const inviterName = req.user?.username || req.user?.email || undefined;
        const emailSent = await sendOrgInviteEmail(email, joinUrl, inviterName);
        res.status(201).json({
          success: true,
          message: emailSent ? "Invite sent" : "Invite created; email was not sent (email is disabled or failed in this environment).",
          emailSent,
        });
      } catch (e) {
        console.error("Create org email invite error:", e);
        Sentry.captureException(e);
        res.status(500).json({ error: "Failed to send invite" });
      }
    }
  );

  /** Revoke an invite link. Accepts joinUrl (token extracted from path) or token. Sets usedAt so the link stops working. */
  app.post(
    "/api/org/invites/revoke-link",
    authenticateToken,
    requireOrgMember,
    requireOrgRole(["owner", "admin"]),
    body("joinUrl").optional().trim(),
    body("token").optional().trim(),
    async (req: Request, res: Response) => {
      try {
        const orgId = (req as any).orgId as string;
        let token: string | undefined = (req.body?.token as string)?.trim();
        const joinUrl = (req.body?.joinUrl as string)?.trim();
        if (!token && joinUrl) {
          const match = joinUrl.match(/\/join\/([^/?#]+)/);
          token = match ? match[1].replace(/\/+$/, "").trim() : undefined;
        }
        if (!token) {
          return res.status(400).json({ error: "joinUrl or token is required" });
        }
        const revoked = await databaseStorage.revokeOrganizationInviteLink(orgId, token);
        if (!revoked) {
          return res.status(404).json({ error: "Invite link not found, already used, or expired" });
        }
        res.status(200).json({ success: true, message: "Invite link revoked" });
      } catch (e) {
        console.error("Revoke invite link error:", e);
        Sentry.captureException(e);
        res.status(500).json({ error: "Failed to revoke invite link" });
      }
    }
  );

  app.post(
    "/api/org/invites/accept",
    authenticateToken,
    body("token").trim().notEmpty().withMessage("token is required"),
    body("leaveCurrentOrg").optional().isBoolean(),
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: "Validation failed", details: errors.array() });
        }
        const userId = req.user!.userId;
        const token = String(req.body.token).trim();
        const leaveCurrentOrg = req.body.leaveCurrentOrg === true;
        const result = await databaseStorage.consumeOrganizationInvite(token, userId, { leaveCurrentOrg });
        if ("error" in result) {
          if (result.code === "already_in_org") {
            return res.status(409).json({ code: "already_in_org", error: result.error });
          }
          const status = result.error.includes("already been used") ? 409 : result.error.includes("expired") ? 410 : 400;
          return res.status(status).json({ error: result.error });
        }
        // Notify all other org members that someone joined (owner, admin, developer, viewer all see it)
        try {
          const members = await databaseStorage.getOrganizationMembers(result.organizationId);
          const joiner = await databaseStorage.getUserById(userId);
          const joinerName = (joiner?.username || joiner?.email || "An organization member").toString().trim();
          const roleLabel = result.role === "owner" ? "owner" : result.role === "admin" ? "admin" : result.role === "developer" ? "developer" : "viewer";
          for (const m of members) {
            const memberUserId = (m as any).userId;
            if (memberUserId === userId) continue;
            await databaseStorage.createNotification({
              userId: memberUserId,
              type: "member_joined",
              title: "New organization member",
              message: `${joinerName} joined the organization as ${roleLabel}.`,
              metadata: JSON.stringify({ organizationId: result.organizationId, joinedUserId: userId, role: result.role }),
            } as any);
          }
        } catch (notifErr) {
          console.error("Failed to create member_joined notifications (non-fatal):", notifErr);
        }
        const user = await databaseStorage.getUserById(userId);
        const requirePasswordChange = !!(user as any)?.mustChangePassword;
        // Update session so the next request sees the new org and role (avoids stale cache showing old org/owner)
        if (req.session?.user) {
          (req.session.user as any).organizationId = result.organizationId;
          (req.session.user as any).role = result.role;
        }
        res.status(200).json({
          success: true,
          organizationId: result.organizationId,
          role: result.role,
          requirePasswordChange,
        });
      } catch (e) {
        console.error("Accept org invite error:", e);
        Sentry.captureException(e);
        res.status(500).json({ error: "Failed to accept invite" });
      }
    }
  );

  // Get user repositories
  app.get("/api/repositories", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get user to check GitHub connection
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // If no GitHub token, still return connected repos from DB so the dashboard list matches the stats
      if (!user.githubId || !user.githubToken) {
        const [connectedRepos, userIntegrations] = await Promise.all([
          databaseStorage.getRepositoriesByUserId(userId),
          storage.getIntegrationsByUserId(userId),
        ]);
        const integrationCountByRepoId = new Map<string, number>();
        for (const i of userIntegrations) {
          const rid = i.repositoryId;
          if (rid != null) integrationCountByRepoId.set(rid, (integrationCountByRepoId.get(rid) ?? 0) + 1);
        }
        const cardData = connectedRepos.map((repo) => ({
          id: repo.id,
          githubId: repo.githubId,
          name: repo.name,
          fullName: repo.fullName,
          full_name: repo.fullName,
          owner: { login: typeof repo.owner === "string" ? repo.owner : (repo.owner as any)?.login ?? "" },
          default_branch: repo.branch ?? "main",
          branch: repo.branch ?? "main",
          isActive: repo.isActive ?? true,
          isConnected: true,
          private: false,
          integrationCount: integrationCountByRepoId.get(repo.id) ?? 0,
          criticalPaths: (repo as any).criticalPaths ?? null,
          incidentServiceName: (repo as any).incidentServiceName ?? null,
        }));
        res.setHeader("Cache-Control", "private, max-age=15");
        res.setHeader("X-Requires-GitHub-Reconnect", "true");
        return res.status(200).json(cardData);
      }

      // Validate GitHub token before fetching repositories
      try {
        const isValid = await validateGitHubToken(user.githubToken);
        if (!isValid) {
          // Clear invalid connection
          await databaseStorage.updateUser(userId, {
            githubId: null,
            githubToken: null
          });
          return res.status(401).json({ 
            error: "GitHub token has expired. Please reconnect your GitHub account.",
            redirectTo: "/login"
          });
        }
      } catch (validationError) {
        console.error("GitHub token validation error:", validationError);
        // Clear invalid connection
        await databaseStorage.updateUser(userId, {
          githubId: null,
          githubToken: null
        });
        return res.status(401).json({ 
          error: "GitHub token has expired. Please reconnect your GitHub account.",
          redirectTo: "/login"
        });
      }

      try {
        // Fetch GitHub repos and DB data in parallel so we don't wait for GitHub before starting DB (or vice versa)
        const [repositories, connectedRepos, userIntegrations] = await Promise.all([
          getUserRepositories(user.githubToken),
          databaseStorage.getRepositoriesByUserId(userId),
          storage.getIntegrationsByUserId(userId),
        ]);

        // Precompute integration count per repo (O(n) instead of O(repos × integrations))
        const integrationCountByRepoId = new Map<string, number>();
        for (const i of userIntegrations) {
          const rid = i.repositoryId;
          if (rid != null) integrationCountByRepoId.set(rid, (integrationCountByRepoId.get(rid) ?? 0) + 1);
        }
        const connectedByGithubId = new Map(connectedRepos.map(r => [r.githubId, r]));

        const enrichedRepos = repositories.map(repo => {
          const connectedRepo = connectedByGithubId.get(repo.id.toString());
          const integrationCount = connectedRepo ? (integrationCountByRepoId.get(connectedRepo.id) ?? 0) : 0;
          return {
            ...repo,
            githubId: repo.id.toString(),
            id: connectedRepo?.id,
            isConnected: !!connectedRepo,
            isActive: connectedRepo?.isActive ?? true,
            monitorAllBranches: connectedRepo?.monitorAllBranches ?? false,
            integrationCount,
            criticalPaths: (connectedRepo as any)?.criticalPaths ?? null,
            incidentServiceName: (connectedRepo as any)?.incidentServiceName ?? null,
          };
        });

        res.setHeader("Cache-Control", "private, max-age=15");
        res.status(200).json(enrichedRepos);
      } catch (githubError: any) {
        console.error("Failed to fetch GitHub repositories:", githubError);
        
        // Check if error is about missing repo scope
        if (githubError.message && githubError.message.includes("repo' scope")) {
          return res.status(403).json({ 
            error: "Your GitHub token is missing the 'repo' scope required to access private repositories. Please disconnect and reconnect your GitHub account to grant the necessary permissions.",
            requiresReauth: true
          });
        }
        
        return res.status(404).json({ error: "No repositories found. Please check your GitHub connection." });
      }
    } catch (error) {
      console.error("Failed to fetch repositories:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to fetch repositories" });
    }
  });

  // Get push events for repositories. Supports ?limit=&offset=&repositoryId=&from=&to=&minImpact=.
  // Returns { events: [...], total: number } for pagination; total is filtered count.
  app.get("/api/push-events", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const offset = Number(req.query.offset) || 0;
      const repositoryId = req.query.repositoryId !== undefined && req.query.repositoryId !== "" ? String(req.query.repositoryId) : undefined;
      const from = (req.query.from as string) || undefined;
      const to = (req.query.to as string) || undefined;
      const minImpact = req.query.minImpact !== undefined && req.query.minImpact !== "" ? Number(req.query.minImpact) : undefined;
      const filters = { repositoryId, from, to, minImpact };

      const [allPushEvents, total] = await Promise.all([
        storage.getPushEventsForUser(userId, { limit, offset, ...filters }),
        storage.getPushEventCountForUser(userId, filters),
      ]);

      const formattedEvents = allPushEvents.map((event: any) => ({
        id: event.id,
        repositoryId: event.repositoryId,
        branch: event.branch,
        commitHash: event.commitSha,
        commitMessage: event.commitMessage,
        author: event.author,
        timestamp: event.pushedAt,
        eventType: 'push'
      }));

      res.status(200).json({ events: formattedEvents, total });
    } catch (error) {
      console.error("Failed to fetch push events:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to fetch push events" });
    }
  });

  // Get single push event with repo + Slack channel (for modal / deep dive)
  app.get("/api/push-events/:id", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: "Invalid push event id" });
      const event = await storage.getPushEvent(id);
      if (!event) return res.status(404).json({ error: "Push event not found" });
      const repo = await storage.getRepository(event.repositoryId);
      if (!repo || repo.userId !== userId) return res.status(404).json({ error: "Push event not found" });
      const integration = await storage.getIntegration(event.integrationId);
      const repositoryFullName = repo.fullName || `${repo.owner}/${repo.name}`;
      res.status(200).json({
        id: event.id,
        repositoryId: event.repositoryId,
        integrationId: event.integrationId,
        branch: event.branch,
        commitHash: event.commitSha,
        commitMessage: event.commitMessage,
        author: event.author,
        timestamp: event.pushedAt,
        aiSummary: event.aiSummary,
        aiImpact: event.aiImpact,
        aiCategory: event.aiCategory,
        aiDetails: event.aiDetails,
        impactScore: event.impactScore,
        riskFlags: event.riskFlags,
        riskMetadata: event.riskMetadata,
        notificationSent: event.notificationSent ?? false,
        additions: event.additions,
        deletions: event.deletions,
        repositoryFullName,
        slackChannelName: integration?.slackChannelName ?? null,
      });
    } catch (err) {
      console.error("Get push event failed:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load push event" });
    }
  });

  // Full-text search over push events (Part 2.2): ?q=...&repositoryId=...&from=...&to=...&minImpact=...&limit=...&offset=...
  app.get("/api/search", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const q = (req.query.q as string)?.trim() ?? "";
      if (!q) {
        return res.status(200).json([]);
      }
      const repositoryId = req.query.repositoryId !== undefined && req.query.repositoryId !== "" ? String(req.query.repositoryId) : undefined;
      const from = (req.query.from as string) || undefined;
      const to = (req.query.to as string) || undefined;
      const minImpact = req.query.minImpact !== undefined && req.query.minImpact !== "" ? Number(req.query.minImpact) : undefined;
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;
      const events = await storage.searchPushEvents(userId, { q, repositoryId, from, to, minImpact, limit, offset });
      const formatted = events.map((event: any) => ({
        id: event.id,
        repositoryId: event.repositoryId,
        branch: event.branch,
        commitHash: event.commitSha,
        commitMessage: event.commitMessage,
        author: event.author,
        timestamp: event.pushedAt,
        eventType: "push",
        aiSummary: event.aiSummary,
        impactScore: event.impactScore,
        riskFlags: event.riskFlags,
      }));
      res.status(200).json(formatted);
    } catch (error) {
      console.error("Search failed:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // Connect a repository
  app.post("/api/repositories", [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Repository name is required and must be 1-100 characters'),
    body('owner').trim().isLength({ min: 1, max: 100 }).withMessage('Repository owner is required and must be 1-100 characters'),
    body('githubId').isInt({ min: 1 }).withMessage('Valid GitHub ID is required'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    body('monitorAllBranches').optional().isBoolean().withMessage('monitorAllBranches must be a boolean')
  ], authenticateToken, requireEmailVerification, requireOrgMember, requireOrgRole(["owner", "admin"]), async (req: any, res: any) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: errors.array() 
        });
      }

      const schema = insertRepositorySchema;
      // userId comes from session (never from body); githubId may be sent as number from client
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const payload = {
        ...req.body,
        userId,
        organizationId: (req.user as any).organizationId ?? undefined,
        githubId: req.body.githubId != null ? String(req.body.githubId) : undefined,
      };
      const validatedData = schema.parse(payload);

      const user = await storage.getUser(req.user!.userId);

      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      if (!user.githubId || !user.githubToken) {
        return res.status(401).json({ error: "GitHub not connected. Please try refreshing your GitHub connection." });
      }

      // Create webhook URL
      const domain = process.env.APP_URL || "https://pushlog.ai";
      const webhookUrl = `${domain}/api/webhooks/github`;

      try {
        // First check if user has access to the repository
        const repoCheckResponse = await fetch(`https://api.github.com/repos/${validatedData.owner}/${validatedData.name}`, {
          headers: {
            "Authorization": `Bearer ${user.githubToken}`,
            "Accept": "application/vnd.github.v3+json",
          },
        });

        if (!repoCheckResponse.ok) {
          throw new Error(`Repository access denied: ${repoCheckResponse.statusText}. Make sure you have access to this repository.`);
        }

        const repoData = await repoCheckResponse.json();

        // Check if user has admin permissions (required for webhooks)
        if (!repoData.permissions?.admin) {
          throw new Error("Admin permissions required. You need admin access to this repository to create webhooks.");
        }

        // Try to create webhook with better error handling
        let webhook;
        try {
          webhook = await createWebhook(
            user.githubToken,
            validatedData.owner,
            validatedData.name,
            webhookUrl
          );
        } catch (webhookError) {
          // If webhook creation fails due to OAuth app limitations, provide helpful error
          if (webhookError instanceof Error && webhookError.message.includes('Resource not accessible by integration')) {
            throw new Error("Webhook creation failed. This is likely due to GitHub OAuth app configuration. Please ensure your GitHub OAuth app has the 'repo' and 'admin:org_hook' scopes configured. You may need to reconnect your GitHub account to get the updated permissions.");
          }
          throw webhookError;
        }

        const repository = await storage.createRepository({
          ...validatedData,
          userId: req.user!.userId,
          organizationId: (req.user as any).organizationId ?? undefined,
          webhookId: webhook.id.toString(),
        });

        res.status(200).json(repository);
      } catch (webhookError) {
        console.error("Webhook creation failed:", webhookError);
        
        // Provide more specific error message
        const errorMessage = webhookError instanceof Error ? webhookError.message : "Unknown error occurred";
        
        // Still create the repository without webhook, but inform the user
        const repository = await storage.createRepository({
          ...validatedData,
          userId: req.user!.userId,
          organizationId: (req.user as any).organizationId ?? undefined,
          webhookId: null,
        });
        res.status(200).json({
          ...repository,
          warning: `Repository connected but webhook creation failed: ${errorMessage}. Push notifications will not work until webhooks are configured. You may need to reconnect your GitHub account to get updated permissions.`
        });
      }
    } catch (error) {
      console.error("Error connecting repository:", error);
      res.status(400).json({ error: "Invalid repository data" });
    }
  });

  // Update repository
  app.patch("/api/repositories/:id", [
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    body('monitorAllBranches').optional().isBoolean().withMessage('monitorAllBranches must be a boolean'),
    body('criticalPaths').optional().isArray().withMessage('criticalPaths must be an array'),
    body('criticalPaths.*').optional().isString().trim().isLength({ max: 256 }).withMessage('each critical path must be a string'),
    body('incidentServiceName').optional({ nullable: true }).custom((v) => v === null || v === undefined || (typeof v === 'string' && v.length <= 128)).withMessage('incidentServiceName must be a string up to 128 chars or null')
  ], authenticateToken, requireOrgMember, requireOrgRole(["owner", "admin"]), async (req: any, res: any) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: errors.array() 
        });
      }

      const repositoryId = req.params.id;
      if (!repositoryId) {
        return res.status(400).json({ error: "Invalid repository ID" });
      }

      const allowed = ['isActive', 'monitorAllBranches', 'criticalPaths', 'incidentServiceName'];
      const updates: Partial<{ isActive: boolean; monitorAllBranches: boolean; criticalPaths: string[]; incidentServiceName: string | null }> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          if (key === 'criticalPaths' && Array.isArray(req.body[key])) {
            updates.criticalPaths = req.body[key].filter((p: unknown) => typeof p === 'string' && p.trim().length > 0);
          } else if (key === 'incidentServiceName') {
            const v = req.body[key];
            updates.incidentServiceName = typeof v === 'string' ? v.trim() || null : null;
          } else if (key === 'isActive' || key === 'monitorAllBranches') {
            (updates as Record<string, unknown>)[key] = req.body[key];
          }
        }
      }
      
      // First verify user owns this repository or is org admin/owner
      const existingRepository = await storage.getRepository(repositoryId);
      if (!existingRepository) {
        return res.status(404).json({ error: "Repository not found" });
      }

      const orgId = (req.user as any).organizationId;
      const canManage = existingRepository.userId === req.user!.userId
        || (orgId && (existingRepository as any).organizationId === orgId && ((req.user as any).role === "owner" || (req.user as any).role === "admin"));
      if (!canManage) {
        return res.status(403).json({ error: "Access denied" });
      }

      const repository = await storage.updateRepository(repositoryId, updates);
      
      if (!repository) {
        return res.status(404).json({ error: "Repository not found" });
      }

      if (updates.isActive !== undefined) {
        const userId = req.user?.userId;
        if (userId) {
          const userIntegrations = await storage.getIntegrationsByUserId(userId);
          const relatedIntegrations = userIntegrations.filter(integration => integration.repositoryId === repositoryId);
          for (const integration of relatedIntegrations) {
            await storage.updateIntegration(integration.id, {
              isActive: updates.isActive as boolean,
            });
          }
        }
      }

      res.status(200).json(repository);
    } catch (error) {
      console.error("Error updating repository:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to update repository" });
    }
  });

  // Disconnect a repository
  app.delete("/api/repositories/:id", authenticateToken, requireOrgMember, requireOrgRole(["owner", "admin"]), async (req, res) => {
    try {
      const repositoryId = req.params.id;
      const repository = await storage.getRepository(repositoryId);
      
      if (!repository) {
        return res.status(404).json({ error: "Repository not found" });
      }

      // Verify user owns this repository or is org admin/owner
      const orgId = (req.user as any).organizationId;
      const canManage = repository.userId === req.user!.userId
        || (orgId && (repository as any).organizationId === orgId && ((req.user as any).role === "owner" || (req.user as any).role === "admin"));
      if (!canManage) {
        return res.status(403).json({ error: "Access denied" });
      }

      const user = await storage.getUser(repository.userId);
      
      if (user && user.githubToken && repository.webhookId) {
        try {
          await deleteWebhook(
            user.githubToken,
            repository.owner,
            repository.name,
            repository.webhookId
          );
        } catch (webhookError) {
          console.error("Failed to delete webhook:", webhookError);
        }
      }

      // Delete all integrations for this repository first (so they are not orphaned or cascade-deleted without user awareness)
      const repoIntegrations = await storage.getIntegrationsByRepositoryId(repositoryId);
      for (const integration of repoIntegrations) {
        await storage.deleteIntegration(integration.id);
      }

      await storage.deleteRepository(repositoryId);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error disconnecting repository:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to disconnect repository" });
    }
  });

  // Test Slack connection - checks if OAuth is configured
  app.get("/api/slack/test", async (req, res) => {
    try {
      // Check if Slack OAuth credentials are configured
      const isConfigured = !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
      res.status(200).json({ connected: isConfigured });
    } catch (error) {
      console.error("Error testing Slack connection:", error);
      Sentry.captureException(error);
      res.status(500).json({ connected: false, error: "Connection test failed" });
    }
  });

  // Preview Slack OAuth popup pages (dev only – so you can see the styled success/error pages)
  // const allowPreview = process.env.NODE_ENV === "development" || process.env.ENABLE_TEST_ROUTES === "true";
  // if (allowPreview) {
  app.get("/api/slack/preview-popup", (req, res) => {
    const variant = (req.query.variant as string)?.toLowerCase();
    if (variant === "error") {
      const redirectUrl = "/dashboard#error=" + encodeURIComponent("Failed to connect Slack workspace");
      return res.type("text/html").send(getSlackErrorPopupHtml(redirectUrl));
    }
    return res.type("text/html").send(getSlackConnectedPopupHtml());
  });
  // }

  // Add Slack connection initiation endpoint
  app.get("/api/slack/connect", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ 
          error: "Authentication required",
          redirectTo: "/login"
        });
      }

      // Generate state for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');
      
      // Store the state and user ID in a temporary session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await databaseStorage.storeOAuthSession({
        token: sessionToken,
        state,
        userId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      });

      // Check if this is a popup request (client can send popup=true query param)
      const isPopup = req.query.popup === 'true';
      
      // Build the Slack OAuth URL
      const url = generateSlackOAuthUrl(state, isPopup);
      
      // Send the URL back to the client
      res.status(200).json({ url, state });
    } catch (error) {
      console.error('Slack connection initiation failed:', error);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Failed to initiate Slack connection' });
    }
  });

  // Slack OAuth callback
  app.get("/api/slack/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({ error: "Missing code or state parameter" });
      }

      // Verify state and get user ID
      const session = await databaseStorage.getOAuthSession(state as string);
      if (!session) {
        return res.status(400).json({ error: "Invalid or expired state parameter" });
      }

      // Exchange code for token (redirect_uri must match authorize request, including ?popup=true)
      const isPopupCallback = req.query.popup === 'true';
      const slackData = await exchangeSlackCodeForToken(code as string, isPopupCallback);

      // Reuse same workspace row for this user+team so integration workspace/channel stay after reconnect
      const existingWorkspace = await databaseStorage.getSlackWorkspaceByTeamIdAndUserId(slackData.team.id, session.userId);
      if (existingWorkspace) {
        await databaseStorage.updateSlackWorkspace(existingWorkspace.id, {
          accessToken: slackData.access_token,
          teamName: slackData.team.name,
          disconnectedAt: null
        });
      } else {
        await databaseStorage.createSlackWorkspace({
          userId: session.userId,
          teamId: slackData.team.id,
          teamName: slackData.team.name,
          accessToken: slackData.access_token
        });
      }

      // Clean up session
      await databaseStorage.deleteOAuthSession(state as string);

      // Check if this is a popup request (via query param)
      const isPopup = req.query.popup === 'true';
      
      if (isPopup) {
        return res.type("text/html").send(getSlackConnectedPopupHtml());
      }

      // Redirect to dashboard with success
      res.redirect(`/dashboard#slack=connected`);
    } catch (error) {
      console.error('Slack OAuth callback error:', error);
      
      const isPopup = req.query.popup === 'true';
      if (isPopup) {
        const redirectUrl = `/dashboard#error=${encodeURIComponent('Failed to connect Slack workspace')}`;
        return res.type("text/html").send(getSlackErrorPopupHtml(redirectUrl));
      }
      
      res.redirect(`/dashboard#error=${encodeURIComponent('Failed to connect Slack workspace')}`);
    }
  });

  // Get user's Slack workspaces
  app.get("/api/slack/workspaces", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const workspaces = await databaseStorage.getSlackWorkspacesByUserId(userId);
      res.status(200).json(workspaces);
    } catch (error) {
      console.error('Error fetching Slack workspaces:', error);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Failed to fetch Slack workspaces' });
    }
  });

  // Get channels for a specific workspace
  app.get("/api/slack/workspaces/:workspaceId/channels", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      const workspaceId = req.params.workspaceId;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const workspace = await databaseStorage.getSlackWorkspace(workspaceId);
      
      if (!workspace || workspace.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const channels = await getSlackChannelsForWorkspace(workspace.accessToken);
      res.status(200).json(channels);
    } catch (error) {
      console.error('Error fetching Slack channels:', error);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Failed to fetch Slack channels' });
    }
  });

  // Disconnect (remove) a Slack workspace for the current user
  app.post("/api/slack/workspaces/:workspaceId/disconnect", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      const workspaceId = req.params.workspaceId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const deleted = await databaseStorage.deleteSlackWorkspace(workspaceId, userId);
      if (!deleted) return res.status(404).json({ error: "Workspace not found or you don't have access" });
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Slack workspace disconnect error:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to disconnect workspace" });
    }
  });

  // Create integration
  app.post("/api/integrations", authenticateToken, requireOrgMember, requireOrgRole(["owner", "admin"]), async (req, res) => {
    try {
      const userId = req.user!.userId;
      // Coerce numeric fields so string IDs from JSON/forms don't fail validation
      const body = req.body as Record<string, unknown>;
      const coercedBody = {
        ...body,
        userId: body.userId != null ? String(body.userId) : userId,
        repositoryId: body.repositoryId != null ? String(body.repositoryId) : body.repositoryId,
        slackWorkspaceId: body.slackWorkspaceId != null && body.slackWorkspaceId !== "" ? String(body.slackWorkspaceId) : body.slackWorkspaceId,
      };
      const validatedData = insertIntegrationSchema.parse(coercedBody);
      
      // Ensure repository exists and belongs to the user's org
      const repository = await storage.getRepository(validatedData.repositoryId);
      if (!repository) {
        return res.status(404).json({ error: "Repository not found", details: "The selected repository does not exist." });
      }
      const orgId = (req.user as any).organizationId;
      const repoInOrg = orgId && (repository as any).organizationId === orgId;
      const repoOwnedByUser = repository.userId === userId;
      if (!repoInOrg && !repoOwnedByUser) {
        return res.status(403).json({ error: "Access denied", details: "You do not have access to this repository." });
      }

      // Auto-enable the repository when creating an integration
      // This makes sense because if someone is creating an integration, they want to monitor the repository
      if (repository.isActive === false) {
        await storage.updateRepository(validatedData.repositoryId, { isActive: true });
      }
      
      // Use user's preferred AI model as default if not specified
      const user = await databaseStorage.getUserById(userId);
      const defaultAiModel = user?.preferredAiModel || 'gpt-5.2';
      
      const integration = await storage.createIntegration({
        ...validatedData,
        userId: userId,
        organizationId: (req.user as any).organizationId ?? undefined,
        aiModel: validatedData.aiModel || defaultAiModel, // Use user's preference as default
      });
      
      // Send welcome message to Slack if integration is active
      if (integration.isActive && integration.slackWorkspaceId) {
        try {
          // Get workspace to get the access token
          const workspace = await databaseStorage.getSlackWorkspace(integration.slackWorkspaceId);
          
          if (workspace) {
            // Get repository info for the welcome message (get fresh data after update)
            const updatedRepository = await storage.getRepository(integration.repositoryId);
            
            if (updatedRepository) {
              await sendIntegrationWelcomeMessage(
                workspace.accessToken,
                integration.slackChannelId,
                updatedRepository.name,
                integration.slackChannelName
              );
              
              // Store notification in database and broadcast for real-time updates
              const slackNotif = await storage.createNotification({
                userId: integration.userId,
                type: 'slack_message_sent',
                title: 'Slack Message Sent',
                message: `Welcome message sent to ${integration.slackChannelName} for ${updatedRepository.name}`
              });
              broadcastNotification(integration.userId, {
                id: slackNotif.id,
                type: 'slack_message_sent',
                title: slackNotif.title,
                message: slackNotif.message,
                metadata: slackNotif.metadata,
                createdAt: slackNotif.createdAt,
                isRead: false,
              });
            }
          }
        } catch (slackError) {
          console.error("Failed to send welcome message:", slackError);
          // Don't fail the integration creation if Slack message fails
        }
      }
      
      res.status(200).json(integration);
    } catch (error) {
      console.error("Error creating integration:", error);
      if (error instanceof z.ZodError) {
        const first = error.errors[0];
        const message = first ? `${first.path.join(".")}: ${first.message}` : "Validation failed";
        // return res.status(400).json({ error: "Invalid integration data", details: message });
        res.status(400).json({ error: "Invalid integration data"});
      }
      res.status(400).json({ error: "Invalid integration data" });
    }
  });

  // Get user stats
  app.get("/api/stats", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const stats = await storage.getStatsForUser(userId);
      res.status(200).json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Get user integrations (single round-trip: integrations + repos in parallel, enrich in memory — no N+1)
  app.get("/api/integrations", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      if (!userId) {
        return res.status(400).json({ error: "Invalid session" });
      }

      const [integrations, repos] = await Promise.all([
        storage.getIntegrationsByUserId(userId),
        storage.getRepositoriesByUserId(userId),
      ]);
      if (!Array.isArray(integrations)) {
        console.error("getIntegrationsByUserId did not return an array:", typeof integrations);
        return res.status(200).json([]);
      }

      const repoById = new Map(repos.map((r) => [r.id, r]));
      const repoIds = Array.from(new Set((integrations as any[]).map((i: any) => i.repositoryId).filter(Boolean)));
      const lastPushByRepo = await databaseStorage.getLatestPushedAtByRepositoryIds(repoIds);
      const enrichedIntegrations = integrations.map((integration: any) => {
        const repoId = integration.repositoryId ?? null;
        const repository = repoId != null ? repoById.get(repoId) : null;
        const sanitized = sanitizeIntegrationForClient(integration);
        return {
          ...sanitized,
          repositoryName: repository?.name ?? "Unknown Repository",
          lastUsed: lastPushByRepo.get(repoId!) ?? integration.createdAt ?? null,
          status: integration.isActive ? "active" : "paused",
          notificationLevel: integration.notificationLevel ?? "all",
          includeCommitSummaries: integration.includeCommitSummaries ?? true,
        };
      });

      res.setHeader("Cache-Control", "private, max-age=15");
      res.status(200).json(enrichedIntegrations);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      Sentry.captureException(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({
        error: "Failed to fetch integrations",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      });
    }
  });

  // Combined repos + integrations (one round-trip for Repositories and Integrations pages)
  app.get("/api/repositories-and-integrations", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.githubId || !user.githubToken) {
        const [connectedRepos, integrations] = await Promise.all([
          databaseStorage.getRepositoriesByUserId(userId),
          storage.getIntegrationsByUserId(userId),
        ]);
        const integrationCountByRepoId = new Map<string, number>();
        for (const i of integrations) {
          const rid = i.repositoryId;
          if (rid != null) integrationCountByRepoId.set(rid, (integrationCountByRepoId.get(rid) ?? 0) + 1);
        }
        const repositories = connectedRepos.map((repo) => ({
          id: repo.id,
          githubId: repo.githubId,
          name: repo.name,
          fullName: repo.fullName,
          full_name: repo.fullName,
          owner: { login: typeof repo.owner === "string" ? repo.owner : (repo.owner as any)?.login ?? "" },
          default_branch: repo.branch ?? "main",
          branch: repo.branch ?? "main",
          isActive: repo.isActive ?? true,
          isConnected: true,
          private: false,
          integrationCount: integrationCountByRepoId.get(repo.id) ?? 0,
          criticalPaths: (repo as any).criticalPaths ?? null,
          incidentServiceName: (repo as any).incidentServiceName ?? null,
        }));
        const repoById = new Map(connectedRepos.map((r) => [r.id, r]));
        const repoIdsReconnect = Array.from(new Set((Array.isArray(integrations) ? integrations : []).map((i: any) => i.repositoryId).filter(Boolean)));
        const lastPushByRepoReconnect = await databaseStorage.getLatestPushedAtByRepositoryIds(repoIdsReconnect);
        const enrichedIntegrations = (Array.isArray(integrations) ? integrations : []).map((integration: any) => {
          const repoId = integration.repositoryId ?? null;
          const repository = repoId != null ? repoById.get(repoId) : null;
          const sanitized = sanitizeIntegrationForClient(integration);
          return {
            ...sanitized,
            repositoryName: repository?.name ?? "Unknown Repository",
            lastUsed: (repoId && lastPushByRepoReconnect.get(repoId)) ?? integration.createdAt ?? null,
            status: integration.isActive ? "active" : "paused",
            notificationLevel: integration.notificationLevel ?? "all",
            includeCommitSummaries: integration.includeCommitSummaries ?? true,
          };
        });
        res.setHeader("Cache-Control", "private, max-age=15");
        return res.status(200).json({ repositories, integrations: enrichedIntegrations, requiresGitHubReconnect: true });
      }

      try {
        const isValid = await validateGitHubToken(user.githubToken);
        if (!isValid) {
          await databaseStorage.updateUser(userId, { githubId: null, githubToken: null });
          return res.status(401).json({ error: "GitHub token has expired. Please reconnect your GitHub account.", redirectTo: "/login" });
        }
      } catch {
        await databaseStorage.updateUser(userId, { githubId: null, githubToken: null });
        return res.status(401).json({ error: "GitHub token has expired. Please reconnect your GitHub account.", redirectTo: "/login" });
      }

      const [repositoriesFromGitHub, connectedRepos, integrations] = await Promise.all([
        getUserRepositories(user.githubToken),
        databaseStorage.getRepositoriesByUserId(userId),
        storage.getIntegrationsByUserId(userId),
      ]);
      const integrationCountByRepoId = new Map<string, number>();
      for (const i of integrations) {
        const rid = i.repositoryId;
        if (rid != null) integrationCountByRepoId.set(rid, (integrationCountByRepoId.get(rid) ?? 0) + 1);
      }
      const connectedByGithubId = new Map(connectedRepos.map((r) => [r.githubId, r]));
      const githubIdsInResponse = new Set(repositoriesFromGitHub.map((repo: any) => repo.id.toString()));
      const repositories = repositoriesFromGitHub.map((repo: any) => {
        const connectedRepo = connectedByGithubId.get(repo.id.toString());
        return {
          ...repo,
          githubId: repo.id.toString(),
          id: connectedRepo?.id,
          isConnected: !!connectedRepo,
          isActive: connectedRepo?.isActive ?? true,
          monitorAllBranches: connectedRepo?.monitorAllBranches ?? false,
          integrationCount: connectedRepo ? (integrationCountByRepoId.get(connectedRepo.id) ?? 0) : 0,
          criticalPaths: (connectedRepo as any)?.criticalPaths ?? null,
          incidentServiceName: (connectedRepo as any)?.incidentServiceName ?? null,
        };
      });
      // Include connected repos that GitHub did not return (so they still show in the UI)
      for (const cr of connectedRepos) {
        const gid = String(cr.githubId ?? "");
        if (!gid || githubIdsInResponse.has(gid)) continue;
        const ownerLogin = typeof cr.owner === "string" ? cr.owner : (cr.owner as any)?.login ?? (cr.fullName?.split("/")[0] ?? "");
        repositories.push({
          id: cr.id,
          githubId: gid,
          name: cr.name,
          full_name: cr.fullName ?? `${ownerLogin}/${cr.name}`,
          fullName: cr.fullName ?? `${ownerLogin}/${cr.name}`,
          owner: { login: ownerLogin },
          default_branch: cr.branch ?? "main",
          branch: cr.branch ?? "main",
          isActive: cr.isActive ?? true,
          isConnected: true,
          monitorAllBranches: cr.monitorAllBranches ?? false,
          private: false,
          integrationCount: integrationCountByRepoId.get(cr.id) ?? 0,
          criticalPaths: (cr as any).criticalPaths ?? null,
          incidentServiceName: (cr as any).incidentServiceName ?? null,
        });
      }
      const repoById = new Map(connectedRepos.map((r) => [r.id, r]));
      const repoIdsMain = Array.from(new Set((Array.isArray(integrations) ? integrations : []).map((i: any) => i.repositoryId).filter(Boolean)));
      const lastPushByRepoMain = await databaseStorage.getLatestPushedAtByRepositoryIds(repoIdsMain);
      const enrichedIntegrations = (Array.isArray(integrations) ? integrations : []).map((integration: any) => {
        const repoId = integration.repositoryId ?? null;
        const repository = repoId != null ? repoById.get(repoId) : null;
        const sanitized = sanitizeIntegrationForClient(integration);
        return {
          ...sanitized,
          repositoryName: repository?.name ?? "Unknown Repository",
          lastUsed: (repoId && lastPushByRepoMain.get(repoId)) ?? integration.createdAt ?? null,
          status: integration.isActive ? "active" : "paused",
          notificationLevel: integration.notificationLevel ?? "all",
          includeCommitSummaries: integration.includeCommitSummaries ?? true,
        };
      });
      res.setHeader("Cache-Control", "no-store, must-revalidate, private");
      return res.status(200).json({ repositories, integrations: enrichedIntegrations });
    } catch (error) {
      console.error("Error fetching repositories and integrations:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to fetch data" });
    }
  });

  // Update integration
  app.patch("/api/integrations/:id", authenticateToken, requireOrgMember, requireOrgRole(["owner", "admin"]), async (req, res) => {
    try {
      const integrationId = req.params.id;
      const updates = { ...req.body };
      
      // OpenRouter API key: encrypt before storing; never send raw key to DB
      if (updates.openRouterApiKey !== undefined) {
        updates.openRouterApiKey = typeof updates.openRouterApiKey === 'string' && updates.openRouterApiKey.trim()
          ? encrypt(updates.openRouterApiKey.trim())
          : null;
      }
      
      
      // First verify user owns this integration
      const existingIntegration = await storage.getIntegration(integrationId);
      if (!existingIntegration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const orgId = (req.user as any).organizationId;
      const canManage = existingIntegration.userId === req.user!.userId
        || (orgId && (existingIntegration as any).organizationId === orgId && ((req.user as any).role === "owner" || (req.user as any).role === "admin"));
      if (!canManage) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (updates.isActive === true) {
        const hasSlack = existingIntegration.slackWorkspaceId && existingIntegration.slackChannelId;
        if (!hasSlack) {
          return res.status(400).json({
            error: "Re-link this integration before unpausing. Open Integration Settings (⋮), select a workspace and channel, then Save.",
          });
        }
      }

      const integration = await storage.updateIntegration(integrationId, updates);
      
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      // If AI model is being updated, also update user's preferred AI model
      // This keeps them in sync for future integrations
      if (updates.aiModel) {
        await databaseStorage.updateUser(req.user!.userId, {
          preferredAiModel: updates.aiModel
        });
      }

      // If integration is being activated (unpaused), also activate the repository
      if (updates.isActive === true && integration.repositoryId) {
        const repository = await storage.getRepository(integration.repositoryId);
        if (repository && repository.isActive === false) {
          await storage.updateRepository(integration.repositoryId, { isActive: true });
        }
      }

      res.status(200).json(sanitizeIntegrationForClient(integration));
    } catch (error) {
      console.error("Error updating integration:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to update integration" });
    }
  });

  // OpenRouter: verify user's API key (returns 401/402 from OpenRouter for invalid key or no credits)
  app.post("/api/openrouter/verify", authenticateToken, async (req, res) => {
    try {
      const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
      if (!apiKey) {
        return res.status(400).json({ valid: false, error: "API key is required" });
      }
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (response.status === 401) {
        return res.status(401).json({ valid: false, error: "Invalid API key. Check your key at openrouter.ai/keys." });
      }
      if (response.status === 402) {
        return res.status(402).json({ valid: false, error: "Insufficient credits on your OpenRouter account." });
      }
      if (!response.ok) {
        return res.status(response.status).json({ valid: false, error: "Could not verify key. Try again." });
      }
      res.status(200).json({ valid: true });
    } catch (err) {
      console.error("OpenRouter verify error:", err);
      Sentry.captureException(err);
      res.status(500).json({ valid: false, error: "Verification failed. Try again." });
    }
  });

  // OpenRouter: save user's API key (encrypted). Call after verify.
  app.post("/api/openrouter/key", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
      if (!apiKey) {
        return res.status(400).json({ error: "API key is required" });
      }
      const encrypted = encrypt(apiKey);
      await databaseStorage.updateUser(userId, { openRouterApiKey: encrypted } as any);
      // Verify persistence: re-fetch user and ensure key was stored (catches missing DB column or failed write)
      const updated = await databaseStorage.getUserById(userId);
      const stored = (updated as any)?.openRouterApiKey;
      if (!stored || typeof stored !== "string" || stored.length === 0) {
        console.error("OpenRouter key save verification failed: user row has no open_router_api_key after update. Run migrations/add-openrouter-api-key-users.sql and ensure ENCRYPTION_KEY is set in .env");
        return res.status(500).json({
          error: "Key did not persist. Ensure the database has the open_router_api_key column (run migrations/add-openrouter-api-key-users.sql) and ENCRYPTION_KEY is set in .env (64 hex chars).",
        });
      }

      // #region agent log
      // #endregion
      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("OpenRouter save key error:", err);
      Sentry.captureException(err);
      const msg = err?.message ?? String(err);
      const code = err?.code ?? err?.cause?.code;
      if (code === "42703" || msg.includes("open_router_api_key")) {
        return res.status(500).json({
          error: "Database missing open_router_api_key column. Run: migrations/add-openrouter-api-key-users.sql",
        });
      }
      if (msg.includes("ENCRYPTION_KEY")) {
        return res.status(500).json({ error: msg });
      }
      res.status(500).json({ error: "Failed to save API key" });
    }
  });

  app.patch("/api/openrouter/update-usage/:id", authenticateToken, async (req, res) => {
    try {
      const generationId = req.params.id;
      const userId = req.user!.userId;
      const usage = await databaseStorage.updateAiUsage(generationId, userId, req.body);
      res.status(200).json(usage);
    } catch (error) {
      console.error('❌ OpenRouter update usage error:', error);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Failed to update OpenRouter usage', details: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // OpenRouter: Deleting a recent AI Usage call on models page
  app.delete("/api/openrouter/delete-usage/:generationId", authenticateToken, async (req, res) => {
    try {
      const generationId = req.params.generationId;
      const userId = req.user!.userId;
      if (!generationId?.trim()) {
        return res.status(400).json({ error: "Generation id required" });
      }
      const deleted = await databaseStorage.deleteAiUsageByOpenRouterGenerationId(userId, generationId);
      if (!deleted) {
        return res.status(404).json({ error: "Usage not found" });
      }
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("OpenRouter delete usage error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to delete usage" });
    }
  });

  // OpenRouter: remove user's saved key
  app.delete("/api/openrouter/key", authenticateToken, async (req, res) => {
    try {
      await databaseStorage.updateUser(req.user!.userId, { openRouterApiKey: null } as any);
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("OpenRouter remove key error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to remove API key" });
    }
  });

  // Recommended models for commit summarization — fetches from APIs, selects best for our use case (coding-aware, short output)
  app.get("/api/recommended-models", async (req, res) => {
    try {
      const result = { openai: null as string | null, openrouter: null as string | null };

      // OpenAI: prefer Codex / latest GPT for coding; fallback order
      const openaiPreferOrder = [
        "gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.3-codex-spark",
        "gpt-5.2", "gpt-5.1", "gpt-4o", "gpt-4o-mini",
      ];
      const openaiKey = process.env.OPENAI_API_KEY?.trim();
      if (openaiKey) {
        try {
          const openaiRes = await fetch("https://api.openai.com/v1/models", {
            headers: { Accept: "application/json", Authorization: `Bearer ${openaiKey}` },
          });
          if (openaiRes.ok) {
            const data = (await openaiRes.json()) as { data?: Array<{ id: string }> };
            const ids = new Set((data.data ?? []).map((m) => m.id));
            for (const id of openaiPreferOrder) {
              if (ids.has(id)) {
                result.openai = id;
                break;
              }
            }
            if (!result.openai) {
              const match = Array.from(ids).find((id) => /^gpt-5|^gpt-4o/i.test(id));
              if (match) result.openai = match;
            }
          }
        } catch {
          /* ignore */
        }
      }

      // OpenRouter: prefer programming category, coding models; fallback order
      const openrouterPreferOrder = [
        "openai/gpt-5.3-codex", "openai/gpt-5.2-codex", "anthropic/claude-sonnet-4", "anthropic/claude-4-sonnet",
        "anthropic/claude-3.5-sonnet", "openai/gpt-5.2", "openai/gpt-4o", "anthropic/claude-opus-4.6", "anthropic/claude-opus-4.6=5"
      ];
      try {
        const url = new URL("https://openrouter.ai/api/v1/models");
        url.searchParams.set("category", "programming");
        const oaRes = await fetch(url.toString(), { headers: { Accept: "application/json" } });
        const fullRes = oaRes.ok ? await oaRes.json() : null;
        let openrouterIds: string[] = [];
        if (fullRes?.data) {
          openrouterIds = (fullRes.data as Array<{ id?: string }>).map((m) => m.id ?? "").filter(Boolean);
        }
        if (openrouterIds.length === 0) {
          const fallback = await fetch("https://openrouter.ai/api/v1/models", { headers: { Accept: "application/json" } });
          if (fallback.ok) {
            const fb = await fallback.json();
            openrouterIds = (fb?.data ?? []).map((m: { id?: string }) => m.id ?? "").filter(Boolean);
          }
        }
        const oaSet = new Set(openrouterIds);
        for (const id of openrouterPreferOrder) {
          if (oaSet.has(id)) {
            result.openrouter = id;
            break;
          }
        }
        if (!result.openrouter && openrouterIds.length > 0) {
          const m = openrouterIds.find((id) => /gpt-5|claude-sonnet|gpt-4o/i.test(id));
          if (m) result.openrouter = m;
        }
      } catch {
        /* ignore */
      }

      res.status(200).json(result);
    } catch (err) {
      console.error("Recommended models fetch error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to fetch recommended models" });
    }
  });

  // OpenAI: list available models (uses app's OPENAI_API_KEY; no auth required)
  app.get("/api/openai/models", async (req, res) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        return res.status(503).json({ error: "OpenAI models list unavailable (OPENAI_API_KEY not configured)." });
      }
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch OpenAI models" });
      }
      const data = (await response.json()) as { data?: Array<{ id: string; created?: number; owned_by?: string }> };
      const raw = data.data ?? [];
      // Chat models + codex (codex is supported via v1/completions in app). Exclude transcribe, TTS, etc.
      const isChatOrCodexModel = (id: string) => {
        const lower = id.toLowerCase();
        if (!/^(gpt-|o1-|o3-|o4-)/i.test(id)) return false;
        if (/transcribe|tts|realtime|whisper|embed|audio|image|vision-only/i.test(lower)) return false;
        if (/-image-|dall-e|dall·e/i.test(lower)) return false;
        return true;
      };
      const models = raw
        .filter((m) => m.id && isChatOrCodexModel(m.id))
        .map((m) => ({
          id: m.id,
          name: m.id,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      res.status(200).json({ models });
    } catch (err) {
      console.error("OpenAI models fetch error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to fetch OpenAI models" });
    }
  });

  // OpenAI: fetch model details (description, pricing) from pricing + docs/models pages
  app.get("/api/openai/model-details", async (req, res) => {
    try {
      type Detail = { id: string; name: string; description?: string; promptPer1M?: number; completionPer1M?: number; tags?: string[] };
      const byId = new Map<string, Detail>();
      const fetchOpts: RequestInit = {
        headers: { "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "User-Agent": "Mozilla/5.0 (compatible; PushLog/1.0)" },
      };

      // 1) Pricing: developers.openai.com has the canonical table (Model, Input, Cached Input, Output per 1M)
      for (const url of [
        "https://developers.openai.com/api/docs/pricing",
        "https://openai.com/api/pricing/",
        "https://platform.openai.com/docs/pricing",
      ]) {
        try {
          const response = await fetch(url, fetchOpts);
          if (!response.ok) continue;
          const details = parseOpenAiPricingPage(await response.text());
          for (const d of details) {
            const key = d.id.toLowerCase();
            if (!byId.has(key)) {
              byId.set(key, { id: d.id, name: d.name, description: d.description, promptPer1M: d.promptPer1M, completionPer1M: d.completionPer1M });
            } else {
              const cur = byId.get(key)!;
              if (d.promptPer1M != null) cur.promptPer1M = d.promptPer1M;
              if (d.completionPer1M != null) cur.completionPer1M = d.completionPer1M;
              if (d.description && (!cur.description || d.description.length > (cur.description?.length ?? 0)))
                cur.description = d.description;
            }
          }
        } catch {
          /* skip */
        }
      }

      // 2) Docs/models page: rich descriptions (prefer over pricing-page blurbs)
      try {
        const docsRes = await fetch("https://platform.openai.com/docs/models", fetchOpts);
        if (docsRes.ok) {
          const docDetails = parseOpenAiModelsDocPage(await docsRes.text());
          for (const d of docDetails) {
            const key = d.id.toLowerCase();
            const existing = byId.get(key);
            const tags = d.category ? [d.category] : undefined;
            if (existing) {
              if (d.description && (!existing.description || d.description.length > (existing.description?.length ?? 0)))
                existing.description = d.description;
              if (tags) existing.tags = tags;
            } else {
              byId.set(key, { id: d.id, name: d.name, description: d.description, tags });
            }
          }
        }
      } catch {
        /* skip */
      }

      // 3) OpenRouter as third-party source: structured API has OpenAI models with pricing (per-token -> we convert to per-1M)
      try {
        const orRes = await fetch("https://openrouter.ai/api/v1/models", { headers: { Accept: "application/json" } });
        if (orRes.ok) {
          const orData = (await orRes.json()) as { data?: Array<{ id?: string; name?: string; description?: string; context_length?: number; pricing?: { prompt?: number; completion?: number } }> };
          const orModels = orData.data ?? [];
          for (const m of orModels) {
            const id = m.id?.trim();
            if (!id || !id.startsWith("openai/")) continue;
            const openaiId = id.replace(/^openai\/\s*/i, "").toLowerCase();
            if (!/^gpt-|^o\d/i.test(openaiId)) continue;
            const promptToken = typeof m.pricing?.prompt === "number" ? m.pricing.prompt : undefined;
            const completionToken = typeof m.pricing?.completion === "number" ? m.pricing.completion : undefined;
            const promptPer1M = promptToken != null ? promptToken * 1_000_000 : undefined;
            const completionPer1M = completionToken != null ? completionToken * 1_000_000 : undefined;
            const existing = byId.get(openaiId);
            if (existing) {
              if (promptPer1M != null && existing.promptPer1M == null) existing.promptPer1M = promptPer1M;
              if (completionPer1M != null && existing.completionPer1M == null) existing.completionPer1M = completionPer1M;
              if (m.description && (!existing.description || existing.description.length < (m.description?.length ?? 0))) existing.description = m.description;
            } else {
              byId.set(openaiId, {
                id: openaiId,
                name: m.name ?? openaiId,
                description: m.description ?? undefined,
                promptPer1M,
                completionPer1M,
              });
            }
          }
        }
      } catch {
        /* skip */
      }

      const detailsList = Array.from(byId.values());
      res.status(200).json({ details: detailsList });
    } catch (err) {
      console.error("OpenAI model-details fetch error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to fetch model details", details: [] });
    }
  });

  // OpenAI: verify user's API key (lightweight models list call)
  app.post("/api/openai/verify", authenticateToken, async (req, res) => {
    try {
      const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
      if (!apiKey) {
        return res.status(400).json({ valid: false, error: "API key is required" });
      }
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (response.status === 401) {
        return res.status(401).json({ valid: false, error: "Invalid API key. Check your key at platform.openai.com." });
      }
      if (response.status === 429) {
        return res.status(402).json({ valid: false, error: "Rate limited. Try again later." });
      }
      if (!response.ok) {
        return res.status(response.status).json({ valid: false, error: "Could not verify key. Try again." });
      }
      res.status(200).json({ valid: true });
    } catch (err) {
      console.error("OpenAI verify error:", err);
      Sentry.captureException(err);
      res.status(500).json({ valid: false, error: "Verification failed. Try again." });
    }
  });

  // OpenAI: save user's API key (encrypted)
  app.post("/api/openai/key", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
      if (!apiKey) {
        return res.status(400).json({ error: "API key is required" });
      }
      const encrypted = encrypt(apiKey);
      await databaseStorage.updateUser(userId, { openaiApiKey: encrypted } as any);
      const updated = await databaseStorage.getUserById(userId);
      const stored = (updated as any)?.openaiApiKey;
      if (!stored || typeof stored !== "string" || stored.length === 0) {
        return res.status(500).json({
          error: "Key did not persist. Ensure the database has the openai_api_key column (run migrations/add-openai-api-key-users.sql) and ENCRYPTION_KEY is set.",
        });
      }
      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("OpenAI save key error:", err);
      Sentry.captureException(err);
      const msg = err?.message ?? String(err);
      if (msg.includes("openai_api_key") || err?.code === "42703") {
        return res.status(500).json({
          error: "Database missing openai_api_key column. Run: migrations/add-openai-api-key-users.sql",
        });
      }
      if (msg.includes("ENCRYPTION_KEY")) return res.status(500).json({ error: msg });
      res.status(500).json({ error: "Failed to save API key" });
    }
  });

  // OpenAI: remove user's saved key
  app.delete("/api/openai/key", authenticateToken, async (req, res) => {
    try {
      await databaseStorage.updateUser(req.user!.userId, { openaiApiKey: null } as any);
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("OpenAI remove key error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to remove API key" });
    }
  });

  // OpenRouter credits (total purchased, total used) – requires user's API key; provisioning keys only per OpenRouter docs
  app.get("/api/openrouter/credits", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const user = await databaseStorage.getUserById(userId);
      const rawKey = (user as any)?.openRouterApiKey;
      const apiKey = rawKey && typeof rawKey === "string" ? decrypt(rawKey) : null;
      if (!apiKey?.trim()) {
        return res.status(400).json({ error: "No OpenRouter API key. Add a key on the Models page to view credits." });
      }
      const response = await fetch("https://openrouter.ai/api/v1/credits", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      });
      if (response.status === 401) {
        return res.status(401).json({ error: "Invalid OpenRouter API key." });
      }
      if (response.status === 403) {
        return res.status(403).json({
          error: "Credits are only available with a provisioning key. Create one at openrouter.ai/keys.",
        });
      }
      if (!response.ok) {
        const text = await response.text();
        console.warn("OpenRouter credits API non-OK:", response.status, text);
        return res.status(response.status).json({ error: "Could not fetch credits. Try again later." });
      }
      const data = await response.json();
      const totalCredits = data?.data?.total_credits ?? 0;
      const totalUsage = data?.data?.total_usage ?? 0;
      const remaining = Math.max(0, Number(totalCredits) - Number(totalUsage));
      res.status(200).json({
        totalCredits: Number(totalCredits),
        totalUsage: Number(totalUsage),
        remainingCredits: remaining,
      });
    } catch (err) {
      console.error("OpenRouter credits error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to fetch OpenRouter credits." });
    }
  });

  // Get OpenRouter usage for a single generation: by push event id (numeric) from DB, or by gen-xxx from OpenRouter API
  app.get("/api/openrouter/usage-per-gen/:id", authenticateToken, async (req, res) => {
    try {
      const idParam = req.params.id;
      if (!idParam?.trim()) {
        return res.status(400).json({ error: "Missing generation id." });
      }
      const userId = req.user!.userId;

      // Push event id (UUID) or legacy numeric: look up our ai_usage row (has openrouter_generation_id + cost stored with push)
      const isPushEventId = /^\d+$/.test(idParam) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
      if (isPushEventId) {
        const usage = await databaseStorage.getAiUsageByPushEventId(idParam, userId);
        if (!usage) {
          return res.status(404).json({ error: "Usage not found for this push." });
        }
        const cost = typeof usage.cost === "number" ? usage.cost : Number(usage.cost) || 0;
        const tokensUsed = typeof usage.tokensUsed === "number" ? usage.tokensUsed : Number(usage.tokensUsed) || 0;
        const generationId = (usage as any).openrouterGenerationId ?? (usage as any).openrouter_generation_id ?? idParam;
        return res.status(200).json({
          generationId: generationId ?? idParam,
          costUsd: cost >= 0 ? cost / 10000 : null,
          costCents: cost >= 0 ? cost : null,
          tokensPrompt: 0,
          tokensCompletion: tokensUsed,
          tokensUsed,
        });
      }

      // Otherwise treat as OpenRouter generation id (gen-xxx): fetch from OpenRouter API
      const user = await databaseStorage.getUserById(userId);
      const rawKey = (user as any)?.openRouterApiKey;
      const apiKey = rawKey && typeof rawKey === "string" ? decrypt(rawKey) : null;
      if (!apiKey?.trim()) {
        return res.status(400).json({ error: "No OpenRouter API key. Add a key on the Models page to view usage per gen." });
      }
      const url = new URL("https://openrouter.ai/api/v1/generation");
      url.searchParams.set("id", idParam);
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      });
      if (!response.ok) {
        return res.status(response.status).json({
          error: response.status === 404 ? "Generation not found." : "Failed to fetch generation.",
        });
      }
      const json = (await response.json()) as { data?: Record<string, unknown> } & Record<string, unknown>;
      const data = json?.data ?? json;
      const raw = (data ?? {}) as Record<string, unknown>;
      // Prefer total_cost (final billed amount); fall back to usage
      const costUsd = (raw.total_cost ?? raw.usage) as number | undefined;
      const tokensPrompt = (raw.tokens_prompt as number | undefined) ?? 0;
      const tokensCompletion = (raw.tokens_completion as number | undefined) ?? 0;
      const costCents =
        typeof costUsd === "number" && costUsd > 0 ? Math.round(costUsd * 10000) : null;
      res.status(200).json({
        generationId: idParam,
        costUsd: typeof costUsd === "number" && costUsd >= 0 ? costUsd : null,
        costCents,
        tokensPrompt,
        tokensCompletion,
        tokensUsed: tokensPrompt + tokensCompletion,
      });
    } catch (err) {
      console.error("OpenRouter usage per gen error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to fetch OpenRouter usage per gen." });
    }
  });

  // OpenRouter usage for current user (calls, tokens, cost from our ai_usage where model is OpenRouter-style provider/model)
  app.get("/api/openrouter/usage", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      let usage: any[];
      try {
        usage = await databaseStorage.getAiUsageWithPushDateByUserId(userId);
      } catch (joinErr) {
        console.warn("OpenRouter usage: join query failed, falling back to simple query:", joinErr);
        usage = await databaseStorage.getAiUsageByUserId(userId, { limit: 500 });
      }
      const openRouterRows = usage.filter((u: any) => u.model && String(u.model).includes("/"));
      const costFromRow = (u: any) => {
        const v = u.cost ?? (u as any).cost;
        return typeof v === "number" ? v : (v != null ? Number(v) : 0);
      };
      const createdAtFromRow = (u: any) => {
        const created = u.createdAt ?? (u as any).created_at;
        const pushed = u.pushedAt ?? (u as any).pushed_at;
        if (created != null && String(created).trim()) return created;
        if (pushed != null && String(pushed).trim()) return pushed;
        return null;
      };
      const toIsoString = (v: unknown): string | null => {
        if (v == null) return null;
        if (typeof v === "string") {
          const d = new Date(v);
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        }
        if (typeof v === "number" && !Number.isNaN(v)) return new Date(v).toISOString();
        if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
        return null;
      };
      const totalCalls = openRouterRows.length;
      const totalTokens = openRouterRows.reduce((sum: number, u: any) => sum + (u.tokensUsed ?? (u as any).tokens_used ?? 0), 0);
      const totalCostCents = openRouterRows.reduce((sum: number, u: any) => sum + costFromRow(u), 0);
      // Per-model totals (cost, call count, tokens) for /models page
      const costByModelMap = new Map<string, { totalCostCents: number; totalCalls: number; totalTokens: number; lastAt: string | null }>();
      for (const u of openRouterRows) {
        const m = String(u?.model ?? "").trim() || "unknown";
        const at = createdAtFromRow(u);
        if (!costByModelMap.has(m)) {
          costByModelMap.set(m, { totalCostCents: 0, totalCalls: 0, totalTokens: 0, lastAt: null });
        }
        const entry = costByModelMap.get(m)!;
        entry.totalCostCents += costFromRow(u);
        entry.totalCalls += 1;
        entry.totalTokens += u.tokensUsed ?? (u as any).tokens_used ?? 0;
        if (at && (!entry.lastAt || new Date(at).getTime() > new Date(entry.lastAt).getTime())) entry.lastAt = at;
      }
      const costByModel = Array.from(costByModelMap.entries()).map(([model, v]) => ({
        model,
        totalCostCents: v.totalCostCents,
        totalCalls: v.totalCalls,
        totalTokens: v.totalTokens,
        lastAt: v.lastAt,
      }));
      // Last-used per model (stored in UTC; frontend displays in user's timezone)
      // Build from costByModelMap (always available) + dedicated query as supplement
      let lastUsedByModel: Record<string, string> = {};
      // Primary: use costByModelMap which already computed lastAt from createdAt/pushedAt
      for (const [m, entry] of Array.from(costByModelMap.entries())) {
        if (entry.lastAt) {
          const iso = toIsoString(entry.lastAt);
          if (iso) lastUsedByModel[m] = iso;
        }
      }
      // Supplement: dedicated DB aggregate (may have more models or more recent data)
      try {
        const lastUsedRows = await databaseStorage.getLastUsedByModelByUserId(userId);
        for (const r of lastUsedRows) {
          if (!r.model || !String(r.model).includes("/") || !r.lastUsedAt) continue;
          const iso = toIsoString(r.lastUsedAt);
          if (!iso) continue;
          const prev = lastUsedByModel[r.model] ? new Date(lastUsedByModel[r.model]).getTime() : 0;
          if (new Date(iso).getTime() > prev) lastUsedByModel[r.model] = iso;
        }
      } catch (_) {
        // costByModelMap already covers this
      }
      res.status(200).json({
        totalCalls,
        totalTokens,
        totalCostCents,
        totalCostFormatted: totalCostCents > 0 ? `$${(totalCostCents / 10000).toFixed(4)}` : (totalCostCents === 0 ? "$0.00" : null),
        costByModel,
        lastUsedByModel,
        calls: openRouterRows.slice(0, 100).map((u: any) => {
          const c = costFromRow(u);
          const at = createdAtFromRow(u);
          const createdAtStr = toIsoString(at) ?? (at != null ? (at instanceof Date ? at.toISOString() : String(at)) : null);
          return {
            id: u.id,
            model: u.model,
            tokensUsed: u.tokensUsed ?? (u as any).tokens_used ?? 0,
            cost: c,
            costFormatted: c > 0 ? `$${(c / 10000).toFixed(4)}` : (c === 0 ? "$0.00" : null),
            createdAt: createdAtStr,
            generationId: u.openrouterGenerationId ?? (u as any).openrouter_generation_id ?? (u as any).openrouterGenerationId ?? null,
          };
        }),
      });
    } catch (err) {
      console.error("OpenRouter usage error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load usage" });
    }
  });

  // OpenAI usage for current user (calls, tokens, cost from ai_usage where model is OpenAI-style, no "/")
  app.get("/api/openai/usage", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      let usage: any[];
      try {
        usage = await databaseStorage.getAiUsageWithPushDateByUserId(userId);
      } catch (joinErr) {
        console.warn("OpenAI usage: join query failed, falling back to simple query:", joinErr);
        usage = await databaseStorage.getAiUsageByUserId(userId, { limit: 500 });
      }
      const openaiRows = usage.filter((u: any) => u.model && !String(u.model).includes("/"));
      const costFromRow = (u: any) => {
        const estimatedUsd = u.estimatedCostUsd ?? (u as any).estimated_cost_usd;
        if (estimatedUsd != null && Number(estimatedUsd) > 0) return Math.round(Number(estimatedUsd) * 10000);
        const v = u.cost ?? (u as any).cost;
        let c = typeof v === "number" ? v : (v != null ? Number(v) : 0);
        if (c === 0 && u.model && ((u.tokensPrompt ?? (u as any).tokens_prompt) != null || (u.tokensCompletion ?? (u as any).tokens_completion) != null)) {
          const prompt = u.tokensPrompt ?? (u as any).tokens_prompt ?? 0;
          const completion = u.tokensCompletion ?? (u as any).tokens_completion ?? 0;
          if (prompt > 0 || completion > 0) {
            const computed = estimateTokenCostFromUsage(String(u.model), prompt, completion);
            if (computed > 0) c = computed;
          }
        }
        return c;
      };
      const formatCost = (c: number, estimatedUsd: number | null) => {
        if (estimatedUsd != null && Number(estimatedUsd) > 0) return `$${Number(estimatedUsd).toFixed(6)}`;
        return c > 0 ? `$${(c / 10000).toFixed(4)}` : (c === 0 ? "$0.00" : null);
      };
      const createdAtFromRow = (u: any) => {
        const created = u.createdAt ?? (u as any).created_at;
        const pushed = u.pushedAt ?? (u as any).pushed_at;
        if (created != null && String(created).trim()) return created;
        if (pushed != null && String(pushed).trim()) return pushed;
        return null;
      };
      const toIsoString = (v: unknown): string | null => {
        if (v == null) return null;
        if (typeof v === "string") {
          const d = new Date(v);
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        }
        if (typeof v === "number" && !Number.isNaN(v)) return new Date(v).toISOString();
        if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
        return null;
      };
      const totalCalls = openaiRows.length;
      const totalTokens = openaiRows.reduce((sum: number, u: any) => sum + (u.tokensUsed ?? (u as any).tokens_used ?? 0), 0);
      const totalCostCents = openaiRows.reduce((sum: number, u: any) => sum + costFromRow(u), 0);
      const costByModelMap = new Map<string, { totalCostCents: number; totalCalls: number; totalTokens: number; lastAt: string | null }>();
      for (const u of openaiRows) {
        const m = String(u?.model ?? "").trim() || "unknown";
        const at = createdAtFromRow(u);
        if (!costByModelMap.has(m)) {
          costByModelMap.set(m, { totalCostCents: 0, totalCalls: 0, totalTokens: 0, lastAt: null });
        }
        const entry = costByModelMap.get(m)!;
        entry.totalCostCents += costFromRow(u);
        entry.totalCalls += 1;
        entry.totalTokens += u.tokensUsed ?? (u as any).tokens_used ?? 0;
        if (at && (!entry.lastAt || new Date(at).getTime() > new Date(entry.lastAt).getTime())) entry.lastAt = at;
      }
      const costByModel = Array.from(costByModelMap.entries()).map(([model, v]) => ({
        model,
        totalCostCents: v.totalCostCents,
        totalCalls: v.totalCalls,
        totalTokens: v.totalTokens,
        lastAt: v.lastAt,
      }));
      let lastUsedByModel: Record<string, string> = {};
      for (const [m, entry] of Array.from(costByModelMap.entries())) {
        if (entry.lastAt) {
          const iso = toIsoString(entry.lastAt);
          if (iso) lastUsedByModel[m] = iso;
        }
      }
      try {
        const lastUsedRows = await databaseStorage.getLastUsedByModelByUserId(userId);
        for (const r of lastUsedRows) {
          if (!r.model || String(r.model).includes("/") || !r.lastUsedAt) continue;
          const iso = toIsoString(r.lastUsedAt);
          if (!iso) continue;
          const prev = lastUsedByModel[r.model] ? new Date(lastUsedByModel[r.model]).getTime() : 0;
          if (new Date(iso).getTime() > prev) lastUsedByModel[r.model] = iso;
        }
      } catch (_) {}
      res.status(200).json({
        totalCalls,
        totalTokens,
        totalCostCents,
        totalCostFormatted: totalCostCents > 0 ? `$${(totalCostCents / 10000).toFixed(4)}` : (totalCostCents === 0 ? "$0.00" : null),
        costByModel,
        lastUsedByModel,
        calls: openaiRows.slice(0, 100).map((u: any) => {
          const c = costFromRow(u);
          const estimatedUsd = u.estimatedCostUsd ?? (u as any).estimated_cost_usd;
          const costStatus = u.costStatus ?? (u as any).cost_status ?? "ok";
          const at = createdAtFromRow(u);
          const createdAtStr = toIsoString(at) ?? (at != null ? (at instanceof Date ? at.toISOString() : String(at)) : null);
          return {
            id: u.id,
            model: u.model,
            tokensUsed: u.tokensUsed ?? (u as any).tokens_used ?? 0,
            tokensPrompt: u.tokensPrompt ?? (u as any).tokens_prompt ?? null,
            tokensCompletion: u.tokensCompletion ?? (u as any).tokens_completion ?? null,
            cost: c,
            estimatedCostUsd: estimatedUsd != null ? Number(estimatedUsd) : null,
            costStatus,
            costFormatted: formatCost(c, estimatedUsd),
            createdAt: createdAtStr,
            generationId: u.openrouterGenerationId ?? (u as any).openrouter_generation_id ?? (u as any).openrouterGenerationId ?? null,
          };
        }),
      });
    } catch (err) {
      console.error("OpenAI usage error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load usage" });
    }
  });

  // OpenAI: get single usage call by id (for "Usage for this call" modal)
  app.get("/api/openai/usage/call/:id", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const usageId = req.params.id;
      if (!usageId?.trim()) {
        return res.status(400).json({ error: "Usage id required" });
      }
      const row = await databaseStorage.getAiUsageById(userId, usageId);
      if (!row) {
        return res.status(404).json({ error: "Usage not found" });
      }
      const tokensPrompt = (row as any).tokensPrompt ?? (row as any).tokens_prompt ?? null;
      const tokensCompletion = (row as any).tokensCompletion ?? (row as any).tokens_completion ?? null;
      const estimatedCostUsd = (row as any).estimatedCostUsd ?? (row as any).estimated_cost_usd;
      const costStatus = (row as any).costStatus ?? (row as any).cost_status ?? "ok";
      let cost = typeof row.cost === "number" ? row.cost : Number(row.cost) || 0;
      if (estimatedCostUsd != null && Number(estimatedCostUsd) > 0) {
        cost = Math.round(Number(estimatedCostUsd) * 10000);
      } else if (cost === 0 && row.model && (tokensPrompt != null || tokensCompletion != null) && ((tokensPrompt ?? 0) > 0 || (tokensCompletion ?? 0) > 0)) {
        const computed = estimateTokenCostFromUsage(String(row.model), tokensPrompt ?? 0, tokensCompletion ?? 0);
        if (computed > 0) cost = computed;
      }
      const costFormatted = estimatedCostUsd != null && Number(estimatedCostUsd) > 0
        ? `$${Number(estimatedCostUsd).toFixed(6)}`
        : cost > 0 ? `$${(cost / 10000).toFixed(4)}` : cost === 0 ? "$0.00" : null;
      const createdAt = row.createdAt ?? (row as any).created_at;
      res.status(200).json({
        id: row.id,
        model: row.model,
        tokensUsed: row.tokensUsed ?? (row as any).tokens_used ?? 0,
        tokensPrompt,
        tokensCompletion,
        cost,
        estimatedCostUsd: estimatedCostUsd != null ? Number(estimatedCostUsd) : null,
        costStatus,
        costFormatted,
        createdAt: createdAt != null ? (typeof createdAt === "string" ? createdAt : new Date(createdAt).toISOString()) : null,
      });
    } catch (err) {
      console.error("OpenAI usage call error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load usage" });
    }
  });

  // OpenAI: delete single usage row from history (OpenAI models only)
  app.delete("/api/openai/usage/:id", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const usageId = req.params.id;
      if (!usageId?.trim()) {
        return res.status(400).json({ error: "Usage id required" });
      }
      const deleted = await databaseStorage.deleteAiUsageById(userId, usageId);
      if (!deleted) {
        return res.status(404).json({ error: "Usage not found or cannot delete" });
      }
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("OpenAI delete usage error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to delete usage" });
    }
  });

  // OpenAI: daily usage for cost-over-time chart (OpenAI models only, no "/" in model)
  app.get("/api/openai/usage/daily", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const days = 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      const dailyFromDb = await databaseStorage.getAiUsageDailyByUserIdOpenAiOnly(userId, startDate);
      const dateKeys: string[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dateKeys.push(d.toISOString().slice(0, 10));
      }
      const byDate = Object.fromEntries(dailyFromDb.map((row) => [row.date, { date: row.date, totalCost: row.totalCost, callCount: row.callCount }]));
      const daily = dateKeys.map((date) => byDate[date] ?? { date, totalCost: 0, callCount: 0 });
      res.status(200).json(daily);
    } catch (err) {
      console.error("OpenAI daily usage error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load daily usage" });
    }
  });

  // OpenAI: current month spend (OpenAI models only) for budget display
  app.get("/api/openai/monthly-spend", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const { totalSpend, callCount } = await databaseStorage.getMonthlyAiSummaryOpenAiOnly(userId, monthStart);
      res.status(200).json({ totalSpend, totalSpendUsd: totalSpend / 10000, callCount });
    } catch (err) {
      console.error("OpenAI monthly spend error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load monthly spend" });
    }
  });

  // OpenRouter: daily usage aggregation for cost-over-time chart on /models page
  app.get("/api/openrouter/usage/daily", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const days = 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      const dailyFromDb = await databaseStorage.getAiUsageDailyByUserId(userId, startDate);
      const dateKeys: string[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dateKeys.push(d.toISOString().slice(0, 10));
      }
      const byDate = Object.fromEntries(dailyFromDb.map(row => [row.date, { date: row.date, totalCost: row.totalCost, callCount: row.callCount }]));
      const daily = dateKeys.map(date => byDate[date] ?? { date, totalCost: 0, callCount: 0 });
      res.status(200).json(daily);
    } catch (err) {
      console.error("OpenRouter daily usage error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load daily usage" });
    }
  });

  // OpenRouter: set/update monthly budget
  app.patch("/api/openrouter/budget", authenticateToken, async (req, res) => {
    try {
      const { budget } = req.body; // budget in USD (e.g. 5.00), or null to clear
      const userId = req.user!.userId;
      const budgetUnits = budget != null && Number(budget) > 0 ? Math.round(Number(budget) * 10000) : null;
      await databaseStorage.updateUser(userId, { monthlyBudget: budgetUnits } as any);
      res.status(200).json({ success: true, monthlyBudget: budgetUnits });
    } catch (err) {
      console.error("Budget update error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to update budget" });
    }
  });

  // OpenRouter: get current month spend for budget progress
  app.get("/api/openrouter/monthly-spend", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const { totalSpend, callCount } = await databaseStorage.getMonthlyAiSummary(userId, monthStart);
      res.status(200).json({ totalSpend, totalSpendUsd: totalSpend / 10000, callCount });
    } catch (err) {
      console.error("Monthly spend error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load monthly spend" });
    }
  });

  // Favorite models CRUD
  app.get("/api/openrouter/favorites", authenticateToken, async (req, res) => {
    try {
      const favorites = await databaseStorage.getFavoriteModelsByUserId(req.user!.userId);
      res.status(200).json(favorites);
    } catch (err) {
      console.error("Favorites list error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load favorites" });
    }
  });

  app.post("/api/openrouter/favorites", authenticateToken, async (req, res) => {
    try {
      const { modelId } = req.body;
      if (!modelId || typeof modelId !== "string") return res.status(400).json({ error: "modelId is required" });
      const fav = await databaseStorage.addFavoriteModel(req.user!.userId, modelId.trim());
      res.status(201).json(fav);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "Already favorited" });
      console.error("Favorite add error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to add favorite" });
    }
  });

  app.delete("/api/openrouter/favorites/:modelId", authenticateToken, async (req, res) => {
    try {
      const modelId = decodeURIComponent(req.params.modelId);
      const removed = await databaseStorage.removeFavoriteModel(req.user!.userId, modelId);
      res.status(200).json({ success: removed });
    } catch (err) {
      console.error("Favorite remove error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to remove favorite" });
    }
  });

  // OpenRouter models list with full details (context_length, pricing) for Models page search/filter
  app.get("/api/openrouter/models", async (req, res) => {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch OpenRouter models" });
      }
      const data = await response.json();
      const raw = data.data || [];
      // Only include text-generation models (exclude image-only, audio-only, etc.)
      const textGen = raw.filter((m: any) => {
        const out = m.architecture?.output_modalities;
        if (!out || !Array.isArray(out)) return true; // no architecture info → include to avoid breaking
        return out.includes("text");
      });
      const models = textGen.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description || "",
        context_length: m.context_length ?? null,
        pricing: m.pricing ? {
          prompt: m.pricing.prompt,
          completion: m.pricing.completion,
          request: m.pricing.request,
        } : null,
        top_provider: m.top_provider ? { context_length: m.top_provider.context_length, max_completion_tokens: m.top_provider.max_completion_tokens } : null,
      }));
      res.status(200).json({ models });
    } catch (err) {
      console.error("OpenRouter models fetch error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to fetch OpenRouter models" });
    }
  });

  // Test Slack delivery for an integration (sends a test message to the channel)
  app.post("/api/integrations/:id/test-slack", authenticateToken, async (req, res) => {
    let integration: Awaited<ReturnType<typeof storage.getIntegration>> | undefined = undefined;
    try {
      const integrationId = req.params.id;
      integration = await storage.getIntegration(integrationId);
      if (!integration || integration.userId !== req.user!.userId) {
        return res.status(404).json({ error: "Integration not found" });
      }
      if (!integration.slackWorkspaceId) {
        return res.status(400).json({ error: "No Slack workspace linked to this integration." });
      }
      const workspace = await databaseStorage.getSlackWorkspace(integration.slackWorkspaceId);
      if (!workspace?.accessToken) {
        return res.status(400).json({ error: "Slack workspace token missing. Reconnect Slack from Integrations." });
      }
      const testMessage = `🧪 *PushLog test* – If you see this, notifications for #${integration.slackChannelName} are working.`;
      await sendSlackMessage(workspace.accessToken, {
        channel: integration.slackChannelId,
        text: testMessage,
        unfurl_links: false,
      });
      res.status(200).json({ success: true, message: "Test message sent to Slack." });
    } catch (err: any) {
      const code = err?.data?.error ?? err?.code;
      const msg = err?.message ?? String(err);
      console.error("Test Slack error:", code || msg, err?.data ? JSON.stringify(err.data) : "");
      if (code === "invalid_auth" || code === "token_revoked") {
        return res.status(401).json({ error: "Slack connection expired or revoked. Reconnect Slack from the Integrations page (Connect Slack)." });
      }
      if (code === "not_in_channel" || code === "channel_not_found") {
        const ch = integration?.slackChannelName ?? "your-channel";
        return res.status(400).json({ error: `PushLog isn't in that channel. In Slack, run: /invite @PushLog in #${ch}.` });
      }
      Sentry.captureException(err);
      res.status(500).json({ error: msg || "Failed to send test message to Slack." });
    }
  });

  // Delete integration
  app.delete("/api/integrations/:id", authenticateToken, requireOrgMember, requireOrgRole(["owner", "admin"]), async (req, res) => {
    try {
      const integrationId = req.params.id;

      // First get the integration to verify ownership
      const integration = await storage.getIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const orgId = (req.user as any).organizationId;
      const canManage = integration.userId === req.user!.userId
        || (orgId && (integration as any).organizationId === orgId && ((req.user as any).role === "owner" || (req.user as any).role === "admin"));
      if (!canManage) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const success = await storage.deleteIntegration(integrationId);
      
      if (!success) {
        return res.status(404).json({ error: "Integration not found" });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting integration:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });

  // Get analytics data (pushes by day, Slack messages by day, AI model usage) — one query per metric
  app.get("/api/analytics", authenticateToken, async (req, res) => {
    const userId = req.user!.userId;
    const days = 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const dateKeys: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dateKeys.push(d.toISOString().slice(0, 10));
    }
    const pushesByDay: { date: string; count: number }[] = dateKeys.map((date) => ({ date, count: 0 }));
    const slackByDay: { date: string; count: number }[] = dateKeys.map((date) => ({ date, count: 0 }));

    try {
      const [pushesRows, topRepos, slackRows, aiModelUsage] = await Promise.all([
        storage.getAnalyticsPushesByDay(userId, startDate),
        storage.getAnalyticsTopRepos(userId, 10),
        storage.getAnalyticsSlackByDay(userId, startDate),
        storage.getAnalyticsAiModelUsage(userId),
      ]);
      for (const row of pushesRows) {
        const entry = pushesByDay.find((p) => p.date === row.date);
        if (entry) entry.count = row.count;
      }
      for (const row of slackRows) {
        const entry = slackByDay.find((p) => p.date === row.date);
        if (entry) entry.count = row.count;
      }
      res.status(200).json({
        pushesByDay,
        slackMessagesByDay: slackByDay,
        aiModelUsage,
        topRepos,
      });
    } catch (err) {
      console.error("Analytics: error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load analytics" });
    }
  });

  // Repo-level analytics: file and folder breakdown (lines changed)
  app.get("/api/analytics/repos/:repositoryId", authenticateToken, async (req, res) => {
    try {
      const repositoryId = req.params.repositoryId;
      if (Number.isNaN(repositoryId)) {
        return res.status(400).json({ error: "Invalid repository ID" });
      }
      const repo = await storage.getRepository(repositoryId);
      if (!repo || repo.userId !== req.user!.userId) {
        return res.status(404).json({ error: "Repository not found" });
      }
      const fileStats = await databaseStorage.getFileStatsByRepositoryId(repositoryId);
      const folderMap: Record<string, { additions: number; deletions: number }> = {};
      for (const f of fileStats) {
        const folder = f.filePath.includes("/") ? f.filePath.split("/")[0] : "(root)";
        if (!folderMap[folder]) folderMap[folder] = { additions: 0, deletions: 0 };
        folderMap[folder].additions += f.additions;
        folderMap[folder].deletions += f.deletions;
      }
      const folderStats = Object.entries(folderMap).map(([folder, stats]) => ({
        folder,
        additions: stats.additions,
        deletions: stats.deletions,
      })).sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));
      res.status(200).json({
        repository: { id: repo.id, name: repo.name, fullName: repo.fullName },
        fileStats: fileStats.sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions)),
        folderStats,
      });
    } catch (err) {
      console.error("Analytics repo detail:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load repo analytics" });
    }
  });

  // Analytics: summary stats from analytics_stats table (latest snapshot + historical for trends)
  app.get("/api/analytics/stats", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      // Create a fresh snapshot
      const latest = await databaseStorage.getStatsForUser(userId);
      // Fetch recent history (last 30 snapshots) for trend charts
      const history = await databaseStorage.getAnalyticsStatsHistory(userId, 30);
      // Compute trend: compare latest to previous snapshot
      const prev = history.length > 1 ? history[1] : null;
      const trend = prev ? {
        dailyPushes: latest.dailyPushes - prev.dailyPushes,
        totalNotifications: latest.totalNotifications - prev.totalNotifications,
        activeIntegrations: latest.activeIntegrations - prev.activeIntegrations,
        totalRepositories: latest.totalRepositories - prev.totalRepositories,
      } : null;
      res.status(200).json({ latest, trend, history });
    } catch (err) {
      console.error("Analytics stats error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load analytics stats" });
    }
  });

  // Analytics: AI cost breakdown (daily cost + cost by model for charts)
  app.get("/api/analytics/cost", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const days = 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      const [dailyFromDb, costByModelRows] = await Promise.all([
        databaseStorage.getAiUsageDailyByUserId(userId, startDate),
        databaseStorage.getAiUsageByModelForAnalytics(userId),
      ]);
      const dateKeys: string[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dateKeys.push(d.toISOString().slice(0, 10));
      }
      const byDate = Object.fromEntries(dailyFromDb.map(row => [row.date, { date: row.date, totalCost: row.totalCost, callCount: row.callCount }]));
      const dailyCost = dateKeys.map(date => byDate[date] ?? { date, totalCost: 0, callCount: 0 });
      const totalSpend = costByModelRows.reduce((sum, r) => sum + r.cost, 0);
      const totalCalls = costByModelRows.reduce((sum, r) => sum + r.calls, 0);
      res.status(200).json({
        totalSpend,
        totalSpendFormatted: `$${(totalSpend / 10000).toFixed(4)}`,
        totalCalls,
        dailyCost,
        costByModel: costByModelRows,
      });
    } catch (err) {
      console.error("Analytics cost error:", err);
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to load cost analytics" });
    }
  });

  // Get push events (authenticated version)
  app.get("/api/push-events", authenticateToken, async (req, res) => {
    try {
      const repositoryId = req.query.repositoryId as string;
      
      if (!repositoryId) {
        return res.status(400).json({ error: "Repository ID required" });
      }

      // Verify user owns this repository
      const repository = await storage.getRepository(repositoryId);
      if (!repository || repository.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const limit = Math.min(Number(req.query.limit) || 200, 500);
      const offset = Number(req.query.offset) || 0;
      const pushEvents = await storage.getPushEventsByRepositoryId(repositoryId, { limit, offset });
      res.status(200).json(pushEvents);
    } catch (error) {
      console.error("Error fetching push events:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to fetch push events" });
    }
  });

  // Test endpoint to re-process a specific push event with AI
  app.post("/api/test-ai-summary/:pushEventId", authenticateToken, async (req, res) => {
    try {
      const pushEventId = req.params.pushEventId;
      const userId = req.user!.userId;
      
      // Allow testing with model parameter directly (for performance tests)
      const testModel = req.body?.model;
      const testMaxTokens = req.body?.maxTokens || 350;
      
      
      // Get user's first active integration for testing (if not using direct model)
      let activeIntegration = null;
      if (!testModel) {
        const userIntegrations = await storage.getIntegrationsByUserId(userId);
        activeIntegration = userIntegrations.find(integration => integration.isActive);
        
        if (!activeIntegration) {
          return res.status(400).json({ error: "No active integrations found. Please create an integration first." });
        }
      }
      
      // Create realistic test data for GPT-5.2 testing
      const testPushData = {
        repositoryName: "carterjohndixon/PushLog",
        branch: "main",
        commitMessage: "feat: Add GPT-5.2 model support and update AI model validation\n\n- Added GPT-5.1 and GPT-5.2 to available models\n- Updated default model to GPT-5.2 (latest working model)\n- Added automatic migration for invalid models\n- Improved AI summary generation with better error handling",
        filesChanged: [
          "server/ai.ts",
          "server/routes.ts", 
          "server/stripe.ts",
          "client/src/components/integration-settings-modal.tsx",
          "shared/schema.ts"
        ],
        additions: 45,
        deletions: 12,
        commitSha: "test-commit-" + Date.now(), // Test commit SHA
      };
      
      // Try to fetch actual stats from GitHub API
      try {
        const [owner, repoName] = testPushData.repositoryName.split('/');
        
        const githubResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/commits/${testPushData.commitSha}`,
          {
            headers: {
              'Authorization': `token ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );
        
        if (githubResponse.ok) {
          const commitData = await githubResponse.json();
          testPushData.additions = commitData.stats?.additions || 0;
          testPushData.deletions = commitData.stats?.deletions || 0;
        } else {
          const errorText = await githubResponse.text();
          console.error(`❌ GitHub API error: ${githubResponse.status} - ${errorText}`);
        }
      } catch (apiError) {
        console.error('❌ Failed to fetch commit stats from GitHub API:', apiError);
      }
      
      // Generate AI summary using the provided model or integration's model settings
      const aiModel = testModel || activeIntegration?.aiModel || "gpt-5.2";
      const maxTokens = testMaxTokens || activeIntegration?.maxTokens || 350;
      
      const summary = await generateCodeSummary(
        testPushData, 
        aiModel,
        maxTokens
      );

      // Send to Slack (always try to send if we have an integration, even when using direct model)
      let slackSent = false;
      if (activeIntegration || testModel) {
        try {
          // If using direct model, try to find any active integration for the user
          let integrationToUse = activeIntegration;
          if (!integrationToUse && testModel) {
            const userIntegrations = await storage.getIntegrationsByUserId(userId);
            integrationToUse = userIntegrations.find(integration => integration.isActive) || null;
          }
          
          if (integrationToUse && integrationToUse.slackWorkspaceId) {
            const workspace = await databaseStorage.getSlackWorkspace(integrationToUse.slackWorkspaceId);
            if (workspace) {
              const slackMessage = await generateSlackMessage(testPushData, summary.summary);
              
              await sendSlackMessage(workspace.accessToken, {
                channel: integrationToUse.slackChannelId,
                blocks: [{ type: "section", text: { type: "mrkdwn", text: slackMessage } }],
                text: slackMessage,
                unfurl_links: false
              });
              
              slackSent = true;
            }
          }
        } catch (slackError) {
          console.error("❌ Failed to send Slack message:", slackError);
        }
      }
      
      const slackMessagePreview = await generateSlackMessage(testPushData, summary.summary);
      
      res.status(200).json({
        success: true,
        pushEventId,
        model: aiModel,
        summary: {
          summary: summary.summary.summary,
          impact: summary.summary.impact,
          category: summary.summary.category,
          details: summary.summary.details,
          tokensUsed: summary.tokensUsed,
          cost: summary.cost,
          actualModel: summary.actualModel
        },
        pushData: testPushData,
        slackMessage: slackMessagePreview,
        slackSent: slackSent
      });
      
    } catch (error) {
      console.error("Error testing AI summary:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to test AI summary" });
    }
  });

  // GitHub webhook is mounted in index.ts with express.raw() so signature is verified against raw body.
  // Do not register it here so index can mount it with raw body parser first.

  // Test route: simulate push → AI summary → Slack (same code path as webhook). Enable with ENABLE_TEST_ROUTES=true.
  app.post("/api/test/simulate-push", authenticateToken, async (req, res) => {
    const allow = process.env.ENABLE_TEST_ROUTES === "true" || process.env.NODE_ENV === "development";
    if (!allow) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const userId = req.user!.userId;
      const integrationId = typeof req.body?.integrationId === "string" ? req.body.integrationId : null;
      const integrations = await storage.getIntegrationsByUserId(userId);
      const integration = integrationId
        ? integrations.find((i) => i.id === integrationId)
        : integrations.find((i) => i.isActive);
      if (!integration || !integration.isActive) {
        return res.status(400).json({ error: "No active integration found. Pass integrationId or ensure one is active." });
      }
      const repo = await storage.getRepository(integration.repositoryId);
      if (!repo) return res.status(400).json({ error: "Repository not found" });

      const pushData = {
        repositoryName: repo.fullName,
        branch: repo.branch || "main",
        commitMessage: "[Test] Simulated push from /api/test/simulate-push",
        filesChanged: ["README.md", "server/routes.ts"],
        additions: 42,
        deletions: 6,
        commitSha: "test-" + Date.now(),
      };


      const integrationAiModel = (integration as any).aiModel ?? (integration as any).ai_model;
      const aiModelStr = (typeof integrationAiModel === "string" && integrationAiModel.trim()) ? integrationAiModel.trim() : "gpt-5.2";
      const maxTokens = integration.maxTokens || 350;
      let openRouterKeyRaw = (integration as any).openRouterApiKey ? decrypt((integration as any).openRouterApiKey) : null;
      if (!looksLikeOpenRouterKey(openRouterKeyRaw)) openRouterKeyRaw = null;
      if (!openRouterKeyRaw?.trim()) {
        const userForKey = await databaseStorage.getUserById(integration.userId);
        if ((userForKey as any)?.openRouterApiKey) {
          openRouterKeyRaw = decrypt((userForKey as any).openRouterApiKey);
        }
      }
      if (!looksLikeOpenRouterKey(openRouterKeyRaw)) openRouterKeyRaw = null;
      const useOpenRouter = !!openRouterKeyRaw?.trim();
      const aiModel = useOpenRouter ? aiModelStr.trim() : aiModelStr.toLowerCase();

      let summary;
      try {
        summary = await generateCodeSummary(
          pushData,
          aiModel,
          maxTokens,
          useOpenRouter ? { openRouterApiKey: openRouterKeyRaw!.trim() } : undefined
        );
      } catch (aiErr) {
        console.error("🧪 [TEST] AI failed:", aiErr);
        Sentry.captureException(aiErr);
        return res.status(500).json({ error: "AI summary failed", details: aiErr instanceof Error ? aiErr.message : String(aiErr) });
      }

      const hasValidContent = summary.summary?.summary?.trim() && summary.summary?.impact && summary.summary?.category;
      const aiGenerated = !summary.isFallback && (summary.tokensUsed > 0 || hasValidContent);
      const aiSummary = aiGenerated ? summary.summary.summary : null;
      const aiImpact = aiGenerated ? summary.summary.impact : null;
      const aiCategory = aiGenerated ? summary.summary.category : null;
      const aiDetails = aiGenerated ? summary.summary.details : null;

      let workspaceToken: string | null = null;
      if (integration.slackWorkspaceId) {
        const workspace = await databaseStorage.getSlackWorkspace(integration.slackWorkspaceId);
        workspaceToken = workspace?.accessToken ?? null;
      }
      if (!workspaceToken) {
        return res.status(500).json({ error: "Slack workspace token not found" });
      }

      if (aiGenerated && aiSummary) {
        const slackMessage = await generateSlackMessage(pushData, {
          summary: aiSummary,
          impact: aiImpact as "low" | "medium" | "high",
          category: aiCategory!,
          details: aiDetails!,
        });
        const ts = await sendSlackMessage(workspaceToken, {
          channel: integration.slackChannelId,
          blocks: [{ type: "section", text: { type: "mrkdwn", text: slackMessage } }],
          text: slackMessage,
          unfurl_links: false,
        });
      } else {
        const ts = await sendPushNotification(
          workspaceToken,
          integration.slackChannelId,
          pushData.repositoryName,
          pushData.commitMessage,
          "Test User",
          pushData.branch,
          pushData.commitSha,
          Boolean(integration.includeCommitSummaries)
        );
      }

      try {
        const pushEvent = await storage.createPushEvent({
          repositoryId: integration.repositoryId,
          integrationId: integration.id,
          commitSha: pushData.commitSha,
          commitMessage: pushData.commitMessage,
          author: "Test User",
          branch: pushData.branch,
          pushedAt: new Date(),
          notificationSent: true,
          additions: pushData.additions,
          deletions: pushData.deletions,
          aiSummary: aiSummary ?? null,
          aiImpact: aiImpact ?? null,
          aiCategory: aiCategory ?? null,
          aiDetails: aiDetails ?? null,
          aiGenerated: !!aiGenerated,
        });
        if (aiGenerated && summary && (summary.tokensUsed > 0 || (summary.cost ?? 0) > 0)) {
          await databaseStorage.createAiUsage({
            userId: integration.userId,
            integrationId: integration.id,
            pushEventId: pushEvent.id,
            model: (summary as any).actualModel ?? aiModel,
            tokensUsed: summary.tokensUsed,
            tokensPrompt: (summary as any).promptTokens ?? null,
            tokensCompletion: (summary as any).completionTokens ?? null,
            cost: summary.cost ?? 0,
            openrouterGenerationId: (summary as any).openrouterGenerationId ?? null,
          });
          // Schedule delayed cost update if cost is $0 and we have an OpenRouter generation id
          if ((summary.cost ?? 0) === 0 && (summary as any).openrouterGenerationId && useOpenRouter && openRouterKeyRaw) {
            scheduleDelayedCostUpdate({
              generationId: (summary as any).openrouterGenerationId,
              apiKey: openRouterKeyRaw.trim(),
              pushEventId: pushEvent.id,
              userId: integration.userId,
            });
          }
        }
      } catch (recordErr) {
        console.warn("🧪 [TEST] Failed to record push event/usage (non-fatal):", recordErr);
      }

      res.status(200).json({
        ok: true,
        message: "Slack message sent",
        integrationId: integration.id,
        channel: integration.slackChannelName,
        aiGenerated,
      });
    } catch (err) {
      console.error("🧪 [TEST] Error:", err);
      Sentry.captureException(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Simulate push failed",
        stack: process.env.NODE_ENV === "development" ? (err instanceof Error ? err.stack : undefined) : undefined,
      });
    }
  });

  // Test route: throws a REAL uncaught error. Sentry captures it via Express integration.
  // You'll see a 500. Flow: throw → Sentry → (if new issue) alert → webhook → PushLog notification.
  // To get a notification every time: add "issue seen more than 0 times" to your Sentry alert, or
  // resolve the issue in Sentry before each test so it counts as a new issue.
  app.get("/api/test/throw", authenticateToken, (req, res) => {
    if (process.env.ENABLE_TEST_ROUTES !== "true" && process.env.NODE_ENV !== "development") {
      return res.status(404).json({ error: "Not found" });
    }
    throw new Error(`[PushLog test] Real uncaught error from server/routes.ts — Sentry captures this (${Date.now()})`);
  });

  // Test route: trigger process-level crash handlers to test crash emails (unhandledRejection or uncaughtException).
  // Requires ENABLE_TEST_ROUTES=true or NODE_ENV=development. ?type=rejection (default, app stays up) or ?type=exception (exits process).
  app.get("/api/test/crash", authenticateToken, (req, res) => {
    const allow = process.env.ENABLE_TEST_ROUTES === "true" || process.env.NODE_ENV === "development";
    if (!allow) {
      return res.status(404).json({ error: "Not found" });
    }
    const type = (req.query.type as string)?.toLowerCase() || "rejection";
    if (type === "exception") {
      res.status(200).json({
        ok: true,
        message: "Uncaught exception will fire in 2s — server will exit. Check your email, then restart the app.",
      });
      setTimeout(() => {
        throw new Error("[PushLog test] Uncaught exception — testing crash email. You can restart the server now.");
      }, 2000);
      return;
    }
    // Default: unhandled rejection (app stays up)
    res.status(200).json({
      ok: true,
      message: "Unhandled rejection triggered. Check your email (and server logs).",
    });
    setImmediate(() => {
      Promise.reject(new Error("[PushLog test] Unhandled rejection — testing crash email."));
    });
  });

  // Test route: report a real error to Sentry so it creates an issue → alert → webhook → PushLog.
  // We capture then return 200 so the UI doesn't see a 500; Sentry still gets the event.
  app.get("/api/test/trigger-error", authenticateToken, (req, res) => {
    const allow = process.env.ENABLE_TEST_ROUTES === "true" || process.env.NODE_ENV === "development";
    if (!allow) {
      console.warn("[trigger-error] 404 — ENABLE_TEST_ROUTES not set and not development");
      return res.status(404).json({ error: "Not found" });
    }
    const err = new Error("[PushLog test] Intentional incident: trigger-error — used to verify Sentry → webhook → incident alerts");
    Sentry.captureException(err);
    console.warn("[trigger-error] 200 — test error sent to Sentry");
    res.status(200).json({
      ok: true,
      message: "Test error reported to Sentry. If your alert rule and webhook are set up, a new issue and incident should appear shortly.",
    });
  });

  // Test route: simulate Sentry-style production incident. Creates notification immediately so the
  // incident toast shows right away; also sends to incident engine for full pipeline.
  app.post("/api/test/simulate-incident", authenticateToken, async (req, res) => {
    const allow = process.env.ENABLE_TEST_ROUTES === "true" || process.env.NODE_ENV === "development";
    if (!allow) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const userId = (req as any).user?.userId as string;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const exceptionType = String(req.body?.exceptionType ?? "TypeError");
      const message = String(req.body?.message ?? "Cannot read property 'id' of undefined");
      const fullPipeline = Boolean(req.body?.fullPipeline);

      const now = new Date().toISOString();
      const ts5MinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // Create notification immediately so client can show toast right away
      const notif = await databaseStorage.createNotification({
        userId,
        type: "incident_alert",
        title: `${exceptionType}: ${message}`,
        message: `New issue detected in api/prod (priority 1)`,
        metadata: JSON.stringify({
          service: "api",
          environment: "prod",
          trigger: "NewIssue",
          severity: "error",
          stacktrace: [
            { file: "src/handler.ts", function: "handleRequest", line: 42 },
            { file: "src/middleware/auth.ts", function: "verifyToken", line: 18 },
          ],
        }),
      });
      broadcastNotification(userId, {
        id: notif.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        metadata: notif.metadata,
        createdAt: notif.createdAt,
        isRead: false,
      });

      // Optionally send to incident engine (full pipeline) — creates a second notification
      // when the engine emits a summary. Includes correlation_hints.critical_paths so you can
      // verify commits touching critical paths get "touches critical path" in suspected_causes.
      if (fullPipeline) {
        const event = {
          source: "sentry",
          service: "api",
          environment: "prod",
          timestamp: now,
          severity: "error" as const,
          exception_type: exceptionType,
          message,
          stacktrace: [
            { file: "src/handler.ts", function: "handleRequest", line: 42 },
            { file: "src/middleware/auth.ts", function: "verifyToken", line: 18 },
          ],
          links: { pushlog_user_id: userId, source_url: "https://sentry.io/issues/simulated-test" },
          change_window: {
            deploy_time: ts5MinAgo,
            commits: [
              { id: "abc123" + Date.now().toString(36), timestamp: ts5MinAgo, files: ["src/handler.ts"] },
              { id: "def456" + Date.now().toString(36), timestamp: ts5MinAgo, files: ["src/middleware/auth.ts"] },
            ],
          },
          correlation_hints: {
            critical_paths: ["src/auth", "src/handler", "src/middleware"],
          },
        };
        ingestIncidentEvent(event);
      }

      res.status(200).json({
        ok: true,
        message: "Incident sent",
        notification: {
          id: notif.id,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          metadata: notif.metadata,
          createdAt: notif.createdAt,
          isRead: false,
        },
      });
    } catch (err) {
      console.error("🧪 [TEST] simulate-incident error:", err);
      Sentry.captureException(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Simulate incident failed",
        stack: process.env.NODE_ENV === "development" ? (err instanceof Error ? err.stack : undefined) : undefined,
      });
    }
  });

  // Current user (session check) - returns 401 if not authenticated. Use for auth checks / Postman.
  app.get("/api/user", authenticateToken, (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    res.status(200).json({
      success: true,
      user: {
        id: req.user.userId,
        username: req.user.username,
        email: req.user.email ?? null,
        isUsernameSet: !!req.user.username,
        emailVerified: req.user.emailVerified,
        githubConnected: req.user.githubConnected,
        googleConnected: req.user.googleConnected,
      },
    });
  });

  // Protected route example - Get user profile
  app.get("/api/profile", authenticateToken, async (req, res) => {
    try {
      // Refresh session expiration (rolling sessions)
      // This ensures the cookie expiration is reset on every request
      // IMPORTANT: We must modify the session to force Express-session to send the cookie
      // on 304 responses. Just touching doesn't mark it as modified.
      if (req.session) {
        req.session.touch();
        // Modify session to force cookie sending (even on 304 responses)
        (req.session as any).lastActivity = Date.now();
        // Explicitly save to ensure cookie is refreshed
        await new Promise<void>((resolve) => {
          req.session.save((err) => {
            if (err) {
              console.error('Error refreshing session:', err);
            }
            // Note: Set-Cookie might not appear in getHeader() on 304, but it should still be sent
            resolve();
          });
        });
      }

      const user = await databaseStorage.getUserById(req.user!.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Sync session when DB says verified but session is stale (e.g. user verified in another tab)
      if (user.emailVerified && req.session?.user && !req.session.user.emailVerified) {
        req.session.user.emailVerified = true;
        req.session.save((err) => { if (err) console.error('Session save error:', err); });
      }

      // Validate GitHub token if user has GitHub connected (non-blocking)
      let githubConnected = false;
      if (user.githubId && user.githubToken) {
        try {
          // Use Promise.race to timeout GitHub validation after 2 seconds
          // This prevents slow GitHub API calls from blocking the profile request
          githubConnected = await Promise.race([
            validateGitHubToken(user.githubToken),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000))
          ]);
          
          // If token is invalid, clear the GitHub connection
          if (!githubConnected) {
            await databaseStorage.updateUser(user.id, {
              githubId: null,
              githubToken: null
            });
          }
        } catch (error) {
          console.error('GitHub token validation error:', error);
          // Clear invalid connection
          await databaseStorage.updateUser(user.id, {
            githubId: null,
            githubToken: null
          });
          githubConnected = false;
        }
      }

      // Prevent caching so clients always get fresh emailVerified after verification
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const organizationId = (req.user as any)?.organizationId ?? (user as any).organizationId ?? null;
      // Always load role from DB for current org so Settings shows source of truth (session can be stale)
      let role: string | null = null;
      if (organizationId) {
        const membership = await databaseStorage.getMembershipByOrganizationAndUser(organizationId, user.id);
        if (membership && ((membership as any).role === 'owner' || (membership as any).role === 'admin' || (membership as any).role === 'developer' || (membership as any).role === 'viewer')) {
          role = (membership as any).role;
        }
      }
      if (!role) role = (req.user as any)?.role ?? null;
      const payload = {
        success: true,
        user: {
          id: user.id,
          username: user.username || '',
          email: user.email || null,
          isUsernameSet: !!user.username,
          emailVerified: !!user.emailVerified,
          githubConnected,
          googleConnected: !!user.googleId,
          aiCredits: user.aiCredits || 0,
          hasOpenRouterKey: !!((user as any).openRouterApiKey),
          hasOpenAiKey: !!((user as any).openaiApiKey),
          monthlyBudget: user.monthlyBudget ?? null,
          overBudgetBehavior: (user as any).overBudgetBehavior === "free_model" ? "free_model" : "skip_ai",
          preferredAiModel: (user as any).preferredAiModel ?? "gpt-5.2",
          devMode: !!(user as any).devMode,
          incidentEmailEnabled: (user as any).incidentEmailEnabled !== false,
          receiveIncidentNotifications: (user as any).receiveIncidentNotifications !== false,
          organizationId: organizationId ?? undefined,
          role: role ?? undefined,
        }
      };
      res.status(200).json(payload);
    } catch (error: any) {
      console.error("Profile error:", error?.message ?? error);
      Sentry.captureException(error);
      if (error?.message?.includes("open_router_api_key") || error?.code === "42703") {
        console.error("Profile failed: users table is missing open_router_api_key. Run: migrations/add-openrouter-api-key-users.sql");
      }
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Update current user (e.g. preferred AI model, over-budget behavior)
  app.patch("/api/user", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const body = req.body as { preferredAiModel?: string; overBudgetBehavior?: string; devMode?: boolean; incidentEmailEnabled?: boolean; receiveIncidentNotifications?: boolean };
      const updates: Record<string, unknown> = {};
      if (body.overBudgetBehavior && body.overBudgetBehavior === "free_model" || body.overBudgetBehavior === "skip_ai") {
        updates.overBudgetBehavior = body.overBudgetBehavior;
      }
      if (body.preferredAiModel) {
        updates.preferredAiModel = body.preferredAiModel;
      }
      if (typeof body.devMode === "boolean") {
        updates.devMode = body.devMode;
      }
      if (typeof body.incidentEmailEnabled === "boolean") {
        updates.incidentEmailEnabled = body.incidentEmailEnabled;
      }
      if (typeof body.receiveIncidentNotifications === "boolean") {
        updates.receiveIncidentNotifications = body.receiveIncidentNotifications;
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid updates" });
      }
      const user = await databaseStorage.updateUser(userId, updates as any);
      if (!user) return res.status(404).json({ error: "User not found" });
      const resBody: { success: boolean; preferredAiModel?: string; overBudgetBehavior?: string; devMode?: boolean; incidentEmailEnabled?: boolean; receiveIncidentNotifications?: boolean } = { success: true };
      if (updates.preferredAiModel !== undefined) resBody.preferredAiModel = (user as any).preferredAiModel;
      if (updates.overBudgetBehavior !== undefined) resBody.overBudgetBehavior = (user as any).overBudgetBehavior;
      if (updates.devMode !== undefined) resBody.devMode = !!(user as any).devMode;
      if (updates.incidentEmailEnabled !== undefined) resBody.incidentEmailEnabled = (user as any).incidentEmailEnabled !== false;
      if (updates.receiveIncidentNotifications !== undefined) resBody.receiveIncidentNotifications = (user as any).receiveIncidentNotifications !== false;
      res.status(200).json(resBody);
    } catch (error) {
      console.error("Error updating user:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Replace all active integrations with a given OpenRouter model (and set as user default)
  app.post("/api/integrations/replace-all-model", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const modelId = typeof req.body?.modelId === "string" ? req.body.modelId.trim() : "";
      if (!modelId) {
        return res.status(400).json({ error: "modelId is required" });
      }
      const integrations = await storage.getIntegrationsByUserId(userId);
      const active = integrations.filter((i) => i.isActive !== false);
      for (const integration of active) {
        await storage.updateIntegration(integration.id, { aiModel: modelId });
      }
      await databaseStorage.updateUser(userId, { preferredAiModel: modelId } as any);
      res.status(200).json({
        success: true,
        updatedCount: active.length,
        preferredAiModel: modelId,
      });
    } catch (error) {
      console.error("Error replacing integrations model:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to update integrations" });
    }
  });

  // Get unread notifications count
  app.get("/api/notifications/unread", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      
      // Get unread notifications from database
      const unreadNotifications = await storage.getUnreadNotificationsByUserId(userId);
      
      // Parse metadata JSON strings into objects for easier client-side access
      const parsedUnreadNotifications = unreadNotifications.map(n => {
        if (n.metadata && typeof n.metadata === 'string') {
          try {
            return { ...n, metadata: JSON.parse(n.metadata) };
          } catch (e) {
            console.error('Failed to parse notification metadata:', e);
            return n;
          }
        }
        return n;
      });
      
      // Get user's email verification status from JWT token first, fallback to database
      const jwtEmailVerified = req.user!.emailVerified;
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        if (req.session) req.session.destroy(() => {});
        return res.status(401).json({ error: "User not found", code: "user_not_found" });
      }

      // Add email verification notification if needed and user was created via regular signup
      // Use JWT token status as it's more up-to-date than database
      let notifications = [...parsedUnreadNotifications];
      
      if (jwtEmailVerified) {
        // User is verified - remove only "Email Verification Required" notifications
        // Keep other email verification notifications like "Verification Email Resent"
        const requiredEmailNotifications = notifications.filter(n => 
          n.type === 'email_verification' && 
          n.title === 'Email Verification Required'
        );
        
        for (const notification of requiredEmailNotifications) {
          try {
            await storage.deleteNotification(notification.id);
          } catch (error) {
            console.error('Error deleting required email verification notification:', error);
          }
        }
        
        // Filter out only the required email verification notifications from the response
        notifications = notifications.filter(n => 
          !(n.type === 'email_verification' && n.title === 'Email Verification Required')
        );
      } else if (!user.githubId && !user.googleId) {
        // User is not verified and signed up via regular signup
        const emailNotificationExists = unreadNotifications.some(n => n.type === 'email_verification');
        if (!emailNotificationExists) {
          const emailNotification = await storage.createNotification({
            userId,
            type: 'email_verification',
            title: 'Email Verification Required',
            message: 'Please verify your email address to fully activate your account'
          });
          notifications.unshift(emailNotification);
        }
      }

      res.status(200).json({
        count: notifications.length,
        notifications
      });
    } catch (error) {
      console.error("Error fetching unread notifications:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to fetch unread notifications" });
    }
  });

  // Get all notifications (both sent and unsent)
  app.get("/api/notifications/all", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 200);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      // Get notifications page from database
      const allNotifications = await storage.getNotificationsByUserId(userId, { limit, offset });
      
      // Get user's email verification status from JWT token first, fallback to database
      const jwtEmailVerified = req.user!.emailVerified;
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        if (req.session) req.session.destroy(() => {});
        return res.status(401).json({ error: "User not found", code: "user_not_found" });
      }
      // Add email verification notification if needed and user was created via regular signup
      // Use JWT token status as it's more up-to-date than database
      let notifications = [...allNotifications];
      
      if (jwtEmailVerified) {
        // User is verified - remove only "Email Verification Required" notifications
        // Keep other email verification notifications like "Verification Email Resent"
        const requiredEmailNotifications = notifications.filter(n => 
          n.type === 'email_verification' && 
          n.title === 'Email Verification Required'
        );
        
        for (const notification of requiredEmailNotifications) {
          try {
            await storage.deleteNotification(notification.id);
          } catch (error) {
            console.error('Error deleting required email verification notification:', error);
          }
        }
        
        // Filter out only the required email verification notifications from the response
        notifications = notifications.filter(n => 
          !(n.type === 'email_verification' && n.title === 'Email Verification Required')
        );
      } else if (!user.githubId && !user.googleId) {
        // User is not verified and signed up via regular signup
        const emailNotificationExists = await storage.hasNotificationOfType(userId, 'email_verification');
        if (!emailNotificationExists) {
          const emailNotification = await storage.createNotification({
            userId,
            type: 'email_verification',
            title: 'Email Verification Required',
            message: 'Please verify your email address to fully activate your account'
          });
          notifications.unshift(emailNotification);
        }
      }

      // Sort notifications by createdAt (newest first)
      notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Parse metadata JSON strings and normalize createdAt (DB may return created_at)
      const notificationsWithParsedMetadata = notifications.map(n => {
        const created = (n as any).createdAt ?? (n as any).created_at;
        let createdAt: string | null = null;
        if (created != null && created !== '') {
          try {
            const d = typeof created === 'string' ? new Date(created) : (created as Date);
            createdAt = d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
          } catch {
            createdAt = null;
          }
        }
        const base = { ...n, createdAt };
        if (base.metadata && typeof base.metadata === 'string') {
          try {
            return { ...base, metadata: JSON.parse(base.metadata) };
          } catch (e) {
            console.error('Failed to parse notification metadata:', e);
            return base;
          }
        }
        return base;
      });

      // Count only unread notifications (not total)
      const unreadCount = notificationsWithParsedMetadata.filter(n => !n.isRead).length;

      res.status(200).json({
        count: unreadCount,
        notifications: notificationsWithParsedMetadata
      });
    } catch (error) {
      console.error("Error fetching all notifications:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to fetch all notifications" });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/mark-read", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      await storage.markAllNotificationsAsRead(userId);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error marking notifications as read:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });

  // Mark a specific notification as read
  app.post("/api/notifications/mark-read/:id", authenticateToken, async (req, res) => {
    try {
      const notificationId = req.params.id;
      const userId = req.user!.userId;
      
      // Verify the notification belongs to the user (single row lookup)
      const notification = await storage.getNotificationByIdAndUserId(notificationId, userId);
      
      if (!notification) {
        console.error(`❌ Notification ${notificationId} not found for user ${userId}`);
        return res.status(404).json({ error: "Notification not found" });
      }
      
      // Mark as read
      const updated = await storage.markNotificationAsRead(notificationId);
      
      if (!updated) {
        console.error(`❌ Failed to update notification ${notificationId}`);
        return res.status(500).json({ error: "Failed to mark notification as read" });
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("❌ Error marking notification as read:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // Delete a specific notification
  app.delete("/api/notifications/delete/:id", authenticateToken, async (req, res) => {
    try {
      const notificationId = req.params.id;
      const userId = req.user!.userId;
      const notification = await storage.getNotificationByIdAndUserId(notificationId, userId);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      const success = await storage.deleteNotification(notificationId);
      if (success) {
        return res.status(200).json({ success: true });
      }
      return res.status(404).json({ error: "Notification not found" });
    } catch (error) {
      console.error("Error deleting notification:", error);
      Sentry.captureException(error);
      return res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // Clear all notifications for a user
  app.delete("/api/notifications/clear-all", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const deletedCount = await storage.getNotificationCountForUser(userId);
      await storage.deleteAllNotifications(userId);
      return res.status(200).json({ success: true, deletedCount });
    } catch (error) {
      console.error("❌ [SERVER] Error clearing notifications:", error);
      Sentry.captureException(error);
      return res.status(500).json({ error: "Failed to clear notifications" });
    }
  });

  app.get("/api/notifications/stream", (req, res) => {
    // Check session instead of token query parameter
    // For SSE, we want to fail gracefully - don't send 401 immediately
    // EventSource will handle the error, but we should try to keep the connection open
    // if possible to avoid triggering unnecessary redirects
    
    if (!req.session || !req.session.userId) {
      // Send an error message via SSE format before closing
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Not authenticated' })}\n\n`);
      res.end();
      return;
    }

    const userId = req.session.userId;
    
    // Refresh session to keep it alive during SSE connection
    if (req.session) {
      req.session.touch();
      (req.session as any).lastActivity = Date.now();
    }
    
    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

    // Store the response object for this user
    if (!global.notificationStreams) {
      global.notificationStreams = new Map();
    }
    global.notificationStreams!.set(userId, res);

    // Handle client disconnect
    req.on('close', () => {
      global.notificationStreams?.delete(userId);
      clearInterval(heartbeat);
    });

    // Keep connection alive with heartbeat
    // Also refresh session periodically to keep it alive
    const heartbeat = setInterval(() => {
      try {
        // Refresh session on heartbeat to keep it alive
        if (req.session) {
          req.session.touch();
          (req.session as any).lastActivity = Date.now();
        }
        res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
      } catch (error) {
        // If write fails, connection is likely closed
        clearInterval(heartbeat);
        global.notificationStreams?.delete(userId);
      }
    }, 30000); // Send heartbeat every 30 seconds
  });

  // Add forgot password endpoint
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json("Email is required");
      }

      // Find user by email
      const user = await databaseStorage.getUserByEmail(email);

      // Don't reveal whether a user exists or not
      if (!user) {
        return res.status(200).json({ 
          success: true,
          message: "If an account exists with this email, you will receive a password reset link."
        });
      }

      // Generate reset token
      const resetPasswordToken = crypto.randomBytes(32).toString('hex');
      const resetPasswordTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      // Update user with reset token
      await databaseStorage.updateUser(user.id, {
        resetPasswordToken,
        resetPasswordTokenExpiry,
      });

      // Send password reset email
      await sendPasswordResetEmail(email, resetPasswordToken);

      res.status(200).json({
        success: true,
        message: "If an account exists with this email, you will receive a password reset link."
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      Sentry.captureException(error);
      res.status(500).json("Failed to process request");
    }
  });

  // Add reset password endpoint
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json("Token and password are required");
      }

      // Find user by reset token
      const user = await databaseStorage.getUserByResetToken(token);

      if (!user) {
        return res.status(400).json("Invalid or expired reset token");
      }

      // Check if token is expired
      if (user.resetPasswordTokenExpiry && new Date(user.resetPasswordTokenExpiry) < new Date()) {
        return res.status(400).json("Reset token has expired");
      }

      // AUTH-VULN-21: Enforce same password rules as signup on reset
      const passwordError = validatePasswordRequirements(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }

      // Check if new password is same as old password
      if (user.password) {
        const isSamePassword = await bcrypt.compare(password, user.password);
        if (isSamePassword) {
          return res.status(400).json("New password must be different from your old password");
        }
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // Update user with new password and clear reset token
      await databaseStorage.updateUser(user.id, {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordTokenExpiry: null
      });

      // AUTH-VULN-02: Invalidate all existing sessions for this user so stolen sessions cannot be used after reset
      await databaseStorage.deleteSessionsForUser(user.id);

      res.status(200).json({
        success: true,
        message: "Password has been reset successfully"
      });
    } catch (error) {
      console.error("Reset password error:", error);
      Sentry.captureException(error);
      res.status(500).json("Failed to reset password");
    }
  });

  // Change password (logged-in user; requires current password). Invalidates all other sessions.
  app.post("/api/change-password", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.userId;
      const { currentPassword, newPassword } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }

      const user = await databaseStorage.getUserById(userId);
      if (!user?.password) {
        return res.status(400).json({ error: "Cannot change password for this account" });
      }

      const currentMatch = await bcrypt.compare(currentPassword, user.password);
      if (!currentMatch) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      const passwordError = validatePasswordRequirements(newPassword);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }

      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return res.status(400).json({ error: "New password must be different from your current password" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await databaseStorage.updateUser(userId, { password: hashedPassword, mustChangePassword: false } as any);

      // Invalidate all other sessions so stolen sessions are logged out; keep current session
      const sessionId = req.sessionID;
      if (sessionId) {
        await databaseStorage.deleteSessionsForUserExcept(userId, sessionId);
      }

      res.status(200).json({
        success: true,
        message: "Password changed successfully. Other sessions have been signed out.",
      });
    } catch (error) {
      console.error("Change password error:", error);
      Sentry.captureException(error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // Payment routes
  app.post("/api/payments/create-payment-intent", authenticateToken, async (req, res) => {
    try {
      if (!BILLING_ENABLED) {
        return res.status(503).json({ error: "Billing is disabled in this environment" });
      }

      const userId = req.user?.userId;
      const { packageId } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!packageId) {
        return res.status(400).json({ error: "Package ID is required" });
      }

      // Get user
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Create or get Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await createStripeCustomer(user.email || '', user.username || '');
        customerId = customer.id;
        await databaseStorage.updateUser(userId, { stripeCustomerId: customerId });
      }

      // Create payment intent
      const paymentIntent = await createPaymentIntent(customerId as string, packageId);

      res.status(200).json({
        clientSecret: paymentIntent.client_secret,
        url: (paymentIntent as any).url
      });
    } catch (error) {
      console.error("Create payment intent error:", error);
      res.status(500).json({ error: "Failed to create payment intent" });
    }
  });

  // Test payment processing endpoint (for development/testing)
  app.post("/api/payments/process-test-payment", authenticateToken, async (req, res) => {
    try {
      if (!BILLING_ENABLED) {
        return res.status(503).json({ error: "Billing is disabled in this environment" });
      }

      const userId = req.user?.userId;
      const { paymentIntentId, packageId, cardDetails } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Validate test card number
      if (cardDetails.number.replace(/\s/g, '') !== '4242424242424242') {
        return res.status(400).json({ error: "Invalid test card number. Use 4242 4242 4242 4242" });
      }

      // Get user
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get package info
      const creditPackage = CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
      if (!creditPackage) {
        return res.status(400).json({ error: "Invalid package" });
      }

      // Add credits to user
      const newCredits = (user.aiCredits || 0) + creditPackage.credits;
      await databaseStorage.updateUser(userId, {
        aiCredits: newCredits
      });

      // Record payment
      await databaseStorage.createPayment({
        userId: userId,
        stripePaymentIntentId: `test_${Date.now()}`,
        amount: creditPackage.price,
        credits: creditPackage.credits,
        status: 'succeeded'
      });

      res.status(200).json({
        success: true,
        creditsAdded: creditPackage.credits,
        newBalance: newCredits
      });
    } catch (error) {
      console.error("Test payment error:", error);
      res.status(500).json({ error: "Failed to process test payment" });
    }
  });

  // Stripe webhook for payment confirmation
  app.post("/api/payments/webhook", async (req, res) => {
    if (!BILLING_ENABLED) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      console.error("Stripe webhook secret not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      
      try {
        // Get user by customer ID
        const user = await databaseStorage.getUserByStripeCustomerId(paymentIntent.customer as string);
        if (!user) {
          console.error("User not found for customer:", paymentIntent.customer);
          return res.status(404).json({ error: "User not found" });
        }

        // Get package info from metadata
        const packageId = paymentIntent.metadata.packageId;
        const credits = parseInt(paymentIntent.metadata.credits);

        // Add credits to user
        await databaseStorage.updateUser(user.id, {
          aiCredits: (user.aiCredits || 0) + credits
        });

        // Record payment
        await databaseStorage.createPayment({
          userId: user.id,
          stripePaymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          credits: credits,
          status: 'succeeded'
        });
      } catch (error) {
        console.error("Error processing payment:", error);
        return res.status(500).json({ error: "Failed to process payment" });
      }
    }

    res.status(200).json({ received: true });
  });

  // =====================================
  // GDPR Compliance Endpoints
  // =====================================

  // Export user data (GDPR)
  app.get("/api/account/export", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      
      const exportData = await databaseStorage.exportUserData(userId);
      
      // Log the export for audit purposes
      await databaseStorage.createNotification({
        userId,
        type: 'data_export',
        title: 'Data Export Requested',
        message: 'Your data export was successfully generated.'
      });
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="pushlog-data-export-${userId}-${Date.now()}.json"`);
      res.status(200).json(exportData);
    } catch (error) {
      console.error("Error exporting user data:", error);
      res.status(500).json({ error: "Failed to export user data" });
    }
  });

  // Delete user account (GDPR)
  app.delete("/api/account", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { confirmDelete } = req.body;
      
      if (confirmDelete !== 'DELETE MY ACCOUNT') {
        return res.status(400).json({ 
          error: "Please confirm deletion by providing the exact phrase",
          requiredPhrase: "DELETE MY ACCOUNT"
        });
      }
      
      const result = await databaseStorage.deleteUserAccount(userId);
      
      if (result.success) {
        res.status(200).json({ 
          success: true, 
          message: "Your account and all associated data have been deleted.",
          deletedData: result.deletedData
        });
      } else {
        console.error(`❌ [GDPR] Account deletion failed for user ${userId}`);
        res.status(500).json({ 
          error: "Failed to delete account. Please contact support.",
          partialDeletion: result.deletedData
        });
      }
    } catch (error) {
      console.error("Error deleting user account:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Get account data summary (for settings page)
  app.get("/api/account/data-summary", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      
      const user = await databaseStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const repos = await databaseStorage.getRepositoriesByUserId(userId);
      const integrations = await databaseStorage.getIntegrationsByUserId(userId);
      const workspaces = await databaseStorage.getSlackWorkspacesByUserId(userId);
      const payments = await databaseStorage.getPaymentsByUserId(userId);

      const pushEventCount = await databaseStorage.getPushEventCountForUser(userId);
      const notificationCount = await databaseStorage.getNotificationCountForUser(userId);
      const aiUsageCount = await databaseStorage.getAiUsageCountForUser(userId);

      res.status(200).json({
        accountCreated: user.createdAt,
        email: user.email,
        emailVerified: user.emailVerified,
        connectedServices: {
          github: !!user.githubId,
          google: !!user.googleId,
          slack: workspaces.length > 0
        },
        dataSummary: {
          repositories: repos.length,
          integrations: integrations.length,
          slackWorkspaces: workspaces.length,
          pushEvents: pushEventCount,
          notifications: notificationCount,
          aiUsageRecords: aiUsageCount,
          payments: payments.length
        },
        aiCredits: user.aiCredits
      });
    } catch (error) {
      console.error("Error getting account summary:", error);
      res.status(500).json({ error: "Failed to get account summary" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
