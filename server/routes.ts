import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { authenticateToken, requireEmailVerification } from './middleware/auth';
import { 
  exchangeCodeForToken, 
  getGitHubUser, 
  getUserRepositories, 
  createWebhook,
  deleteWebhook,
  verifyWebhookSignature,
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
import { sendVerificationEmail, sendPasswordResetEmail } from './email';
import { generateCodeSummary, generateSlackMessage, fetchOpenRouterGenerationUsage } from './ai';
import { createStripeCustomer, createPaymentIntent, stripe, CREDIT_PACKAGES, isBillingEnabled } from './stripe';
import { encrypt, decrypt } from './encryption';
import { body, validationResult } from "express-validator";
import { verifySlackRequest, parseSlackCommandBody, handleSlackCommand } from './slack-commands';
import { getSlackConnectedPopupHtml, getSlackErrorPopupHtml } from './templates/slack-popups';
import broadcastNotification from "./helper/broadcastNotification";
import { handleGitHubWebhook, scheduleDelayedCostUpdate } from "./githubWebhook";
import {
  ingestIncidentEvent,
  onIncidentSummary,
  type IncidentEventInput,
  type IncidentSummaryOutput,
} from "./incidentEngine";

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

function getProdPromotionStatusUrl(): string | null {
  if (!PROMOTE_PROD_WEBHOOK_URL) return null;
  try {
    const statusUrl = new URL(PROMOTE_PROD_WEBHOOK_URL);
    statusUrl.pathname = "/api/webhooks/promote-production/status";
    statusUrl.search = "";
    return statusUrl.toString();
  } catch {
    return null;
  }
}

function getProdPromotionCancelUrl(): string | null {
  if (!PROMOTE_PROD_WEBHOOK_URL) return null;
  try {
    const cancelUrl = new URL(PROMOTE_PROD_WEBHOOK_URL);
    cancelUrl.pathname = "/api/webhooks/promote-production/cancel";
    cancelUrl.search = "";
    return cancelUrl.toString();
  } catch {
    return null;
  }
}

async function fetchRecentCommitsFromGitHub(limit = 30): Promise<Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }>> {
  try {
    const res = await fetch(`https://api.github.com/repos/carterjohndixon/PushLog/commits?per_page=${limit}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return [];
    const data: any[] = await res.json();
    return data
      .map((item) => ({
        sha: String(item?.sha || ""),
        shortSha: String(item?.sha || "").slice(0, 7),
        dateIso: String(item?.commit?.author?.date || ""),
        author: String(item?.commit?.author?.name || item?.author?.login || "unknown"),
        subject: String(item?.commit?.message || "").split("\n")[0] || "No commit message",
      }))
      .filter((c) => !!c.sha);
  } catch {
    return [];
  }
}

function derivePendingFromRecent(
  recentCommits: Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }>,
  deployedSha: string | null
) {
  if (!recentCommits.length || !deployedSha) {
    return { pendingCount: 0, pendingCommits: [] as Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }> };
  }
  const idx = recentCommits.findIndex((c) => c.sha === deployedSha);
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
    console.log("[Slack /pushlog] team_id=%s channel_id=%s channel_name=%s → %d integration(s)", tid, cid, (payload as any).channel_name ?? "", integrations.length);
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

export async function registerRoutes(app: Express): Promise<Server> {
  const getDefaultIncidentNotifyUserIds = (): string[] => {
    return (process.env.INCIDENT_NOTIFY_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const handleIncidentSummary = async (summary: IncidentSummaryOutput) => {
    console.log(
      `[incident-engine] incident ${summary.incident_id} (${summary.trigger}) ${summary.service}/${summary.environment}: ${summary.title}`
    );

    // Route incidents to one user when payload includes links.pushlog_user_id.
    // Otherwise fan out to INCIDENT_NOTIFY_USER_IDS; if unset, notify all users.
    const targetUsers = new Set<string>();
    const linkedUserId = summary.links?.pushlog_user_id?.trim();
    if (linkedUserId) targetUsers.add(linkedUserId);
    for (const id of getDefaultIncidentNotifyUserIds()) targetUsers.add(id);

    if (targetUsers.size === 0) {
      const allUserIds = await storage.getAllUserIds();
      for (const id of allUserIds) targetUsers.add(id);
    }

    if (targetUsers.size === 0) return;

    const message = `${summary.trigger.replace(/_/g, " ")} detected in ${summary.service}/${summary.environment} (priority ${summary.priority_score})`;
    const metadata = JSON.stringify({
      incidentId: summary.incident_id,
      service: summary.service,
      environment: summary.environment,
      trigger: summary.trigger,
      severity: summary.severity,
      priorityScore: summary.priority_score,
      startTime: summary.start_time,
      lastSeen: summary.last_seen,
      links: summary.links || {},
    });

    await Promise.all(
      Array.from(targetUsers).map(async (userId) => {
        try {
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
      return res.status(500).json({ error: "Failed to ingest incident event" });
    }
  });

  // Sentry webhook adapter: accepts Sentry issue-alert payload, transforms to incident engine format
  app.post("/api/webhooks/sentry", async (req, res) => {
    try {
      const configuredSecret = process.env.SENTRY_WEBHOOK_SECRET?.trim();
      if (configuredSecret) {
        const sig = (req.headers["sentry-hook-signature"] as string)?.trim();
        if (!sig) {
          return res.status(401).json({ error: "Missing Sentry-Hook-Signature" });
        }
        const crypto = await import("crypto");
        const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        const computed = crypto.createHmac("sha256", configuredSecret).update(payload).digest("hex");
        const expected = sig.startsWith("sha256=") ? "sha256=" + computed : computed;
        if (sig !== expected) {
          return res.status(401).json({ error: "Invalid signature" });
        }
      }

      const body = req.body as Record<string, unknown>;
      const data = body?.data as Record<string, unknown> | undefined;
      const ev = data?.event as Record<string, unknown> | undefined;
      if (!ev) {
        return res.status(400).json({ error: "Missing data.event" });
      }

      const exception = ev.exception as { values?: Array<{ type?: string; value?: string; stacktrace?: { frames?: Array<{ filename?: string; abs_path?: string; function?: string; raw_function?: string; lineno?: number }> }> } } | undefined;
      const firstExc = exception?.values?.[0];
      const frames = firstExc?.stacktrace?.frames ?? [];
      const stacktrace = frames
        .map((f: { filename?: string; abs_path?: string; function?: string; raw_function?: string; lineno?: number }) => {
          const file = (f.filename || f.abs_path || "unknown").trim() || "unknown";
          const fn = f.function || f.raw_function || "";
          return { file, function: fn, line: f.lineno };
        })
        .filter((f: { file: string }) => f.file !== "unknown" && f.file.length > 0);
      if (stacktrace.length === 0) stacktrace.push({ file: "sentry", function: "unknown" });

      const level = String(ev.level || "error").toLowerCase();
      const severity = level === "fatal" || level === "critical" ? "critical" : level === "warning" ? "warning" : "error";

      let timestamp = ev.datetime as string | undefined;
      if (!timestamp && typeof ev.timestamp === "number") {
        timestamp = new Date(ev.timestamp * 1000).toISOString();
      }
      if (!timestamp) timestamp = new Date().toISOString();

      const tags = ev.tags as Array<[string, string]> | Record<string, string> | undefined;
      let environment = "production";
      if (Array.isArray(tags)) {
        const envTag = tags.find((t) => t[0] === "environment");
        if (envTag?.[1]) environment = envTag[1];
      } else if (tags && typeof tags === "object" && tags.environment) {
        environment = String(tags.environment);
      }
      const proj = data?.project as Record<string, unknown> | string | number | undefined;
      const projectSlug = typeof proj === "object" && proj?.slug ? String(proj.slug) : typeof ev.project === "string" ? ev.project : "api";
      const service = projectSlug || "api";

      const event: IncidentEventInput = {
        source: "sentry",
        service,
        environment,
        timestamp,
        severity,
        exception_type: firstExc?.type || (ev.metadata as Record<string, unknown>)?.type as string || "Error",
        message: firstExc?.value || (ev.title as string) || (ev.metadata as Record<string, unknown>)?.value as string || "Unknown error",
        stacktrace,
        links: ev.web_url ? { source_url: ev.web_url as string } : undefined,
      };
      ingestIncidentEvent(event);
      console.log(`[webhooks/sentry] Ingested: ${event.exception_type} in ${service}/${environment}`);
      return res.status(202).json({ accepted: true });
    } catch (error) {
      console.error("Sentry webhook error:", error);
      return res.status(500).json({ error: "Failed to process Sentry webhook" });
    }
  });

  // Deployment webhook endpoint (secured with secret token)
  app.post("/api/webhooks/deploy", async (req, res) => {
    try {
      // Verify GitHub webhook signature (primary security)
      const signature = req.headers['x-hub-signature-256'] as string;
      const deploySecret = process.env.DEPLOY_SECRET || '';
      const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET || '';
      const webhookSecret = deploySecret || githubWebhookSecret;
      
      if (signature && webhookSecret) {
        const payload = JSON.stringify(req.body);
        if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      } else if (!signature) {
        // Fallback: Check for custom header if no GitHub signature
        const providedSecret = req.headers['x-deploy-secret'] as string;
        
        if (!deploySecret || providedSecret !== deploySecret) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      } else {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get deployment script path
      const appDir = resolveAppDir();
      const deployScript = path.join(appDir, 'deploy.sh');

      // Check if deploy script exists
      if (!fs.existsSync(deployScript)) {
        console.error(`❌ Deploy script not found: ${deployScript}`);
        return res.status(500).json({ error: 'Deploy script not found' });
      }

      // Execute deployment script asynchronously (don't wait for it to finish)
      execAsync(`bash ${deployScript}`, {
        cwd: appDir,
        env: {
          ...process.env,
          APP_DIR: appDir,
          DEPLOY_BRANCH: req.body.ref?.replace('refs/heads/', '') || 'main',
          PATH: process.env.PATH // Ensure PATH includes PM2
        },
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer for output
      }).then(({ stdout, stderr }) => {
        if (stderr) {
          console.error('Deployment stderr:', stderr);
        }
      }).catch((error) => {
        console.error('Deployment failed:', error.message);
      });

      // Respond immediately (deployment runs in background)
      res.status(200).json({ 
        message: 'Deployment started',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Deployment webhook error:', error);
      res.status(500).json({ error: 'Deployment failed' });
    }
  });

  // Production webhook: trigger host-side production promotion script.
  // Intended to be called by staging admin flow with x-promote-secret.
  app.post("/api/webhooks/promote-production", async (req, res) => {
    try {
      if (APP_ENV !== "production") {
        return res.status(404).json({ error: "Not found" });
      }

      const providedSecret = String(req.headers["x-promote-secret"] || "");
      const expectedSecret = process.env.PROMOTE_PROD_WEBHOOK_SECRET || process.env.DEPLOY_SECRET || "";
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

      fs.writeFileSync(
        lockFile,
        JSON.stringify(
          {
            startedAt: new Date().toISOString(),
            byWebhook: true,
            by: req.body?.promotedBy || "staging-admin",
          },
          null,
          2
        )
      );

      // PM2 treekill kills ALL descendants of the worker process, even detached ones.
      // Use nohup setsid to launch the script in a completely new session so it's
      // NOT a descendant of this worker and survives PM2 restart.
      const promotedBy = String(req.body?.promotedBy || "staging-admin");
      const cmd = `nohup setsid bash "${promoteScript}" </dev/null >>"${path.join(appDir, "deploy-promotion-stdout.log")}" 2>&1 &`;
      exec(cmd, {
        cwd: appDir,
        env: {
          ...process.env,
          APP_DIR: appDir,
          PROMOTED_BY: promotedBy,
          PROMOTE_LOCK_FILE: lockFile,
        },
      });

      return res.json({
        message: "Production promotion started",
        startedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Failed to start production promotion webhook:", error);
      return res.status(500).json({ error: error?.message || "Failed to start promotion" });
    }
  });

  // Production webhook: cancel an in-progress promotion (kill deploy script, remove lock).
  app.post("/api/webhooks/promote-production/cancel", async (req, res) => {
    try {
      if (APP_ENV !== "production") {
        return res.status(404).json({ error: "Not found" });
      }

      const providedSecret = String(req.headers["x-promote-secret"] || "");
      const expectedSecret = process.env.PROMOTE_PROD_WEBHOOK_SECRET || process.env.DEPLOY_SECRET || "";
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
      const expectedSecret = process.env.PROMOTE_PROD_WEBHOOK_SECRET || process.env.DEPLOY_SECRET || "";
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

      // Git info (available on host, not in Docker staging)
      let branch = "unknown";
      let headSha = "";
      let recentCommitsRaw = "";
      try {
        const [{ stdout: branchOut }, { stdout: headOut }, { stdout: recentLogOut }] = await Promise.all([
          execAsync("git rev-parse --abbrev-ref HEAD", { cwd: appDir }),
          execAsync("git rev-parse HEAD", { cwd: appDir }),
          execAsync("git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso -n 30", { cwd: appDir }),
        ]);
        branch = branchOut.trim();
        headSha = headOut.trim();
        recentCommitsRaw = recentLogOut;
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

      // Fallback for environments where git metadata is unavailable.
      if (recentCommits.length === 0) {
        recentCommits = await fetchRecentCommitsFromGitHub(30);
        if (!headSha && recentCommits[0]?.sha) headSha = recentCommits[0].sha;
        if (branch === "unknown" && recentCommits.length > 0) branch = "main";
      }

      // Compute pending commits if we have a deployed SHA
      let pendingCount = 0;
      let pendingCommits: Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }> = [];
      if (prodDeployedSha && headSha) {
        try {
          const [{ stdout: countOut }, { stdout: pendingOut }] = await Promise.all([
            execAsync(`git rev-list --count ${prodDeployedSha}..HEAD`, { cwd: appDir }),
            execAsync(`git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso ${prodDeployedSha}..HEAD -n 30`, { cwd: appDir }),
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
      const promoteViaWebhook = APP_ENV === "staging" && !!PROMOTE_PROD_WEBHOOK_URL && !!PROMOTE_PROD_WEBHOOK_SECRET;

      let branch = "unknown";
      let headSha = "";
      let recentOut = "";
      try {
        const [{ stdout: branchOut }, { stdout: headOut }, { stdout: recentLogOut }] = await Promise.all([
          execAsync("git rev-parse --abbrev-ref HEAD", { cwd: appDir }),
          execAsync("git rev-parse HEAD", { cwd: appDir }),
          execAsync("git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso -n 20", { cwd: appDir }),
        ]);
        branch = branchOut.trim();
        headSha = headOut.trim();
        recentOut = recentLogOut;
      } catch {
        // Running in a container/dir without git metadata; keep admin page usable.
      }
      const prodDeployedSha = fs.existsSync(prodShaFile) ? fs.readFileSync(prodShaFile, "utf8").trim() : null;
      const prodDeployedAt = fs.existsSync(prodAtFile) ? fs.readFileSync(prodAtFile, "utf8").trim() : null;

      const recentCommits = recentOut
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [sha, shortSha, dateIso, author, ...subjectParts] = line.split("|");
          return { sha, shortSha, dateIso, author, subject: subjectParts.join("|") };
        });

      let pendingCount = 0;
      let pendingCommits: Array<{ sha: string; shortSha: string; dateIso: string; author: string; subject: string }> = [];
      if (prodDeployedSha && headSha) {
        try {
          const [{ stdout: countOut }, { stdout: pendingOut }] = await Promise.all([
            execAsync(`git rev-list --count ${prodDeployedSha}..HEAD`, { cwd: appDir }),
            execAsync(`git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso ${prodDeployedSha}..HEAD -n 20`, { cwd: appDir }),
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
      const promoteStatusUrl = promoteViaWebhook ? getProdPromotionStatusUrl() : null;

      let promoteRemoteStatus: any = null;
      if (promoteStatusUrl && PROMOTE_PROD_WEBHOOK_SECRET) {
        try {
          const response = await fetch(promoteStatusUrl, {
            headers: { "x-promote-secret": PROMOTE_PROD_WEBHOOK_SECRET },
          });
          const contentType = response.headers.get("content-type") || "";

          if (contentType.includes("application/json")) {
            const body = await response.json().catch(() => ({}));
            if (response.ok) {
              promoteRemoteStatus = body;
            } else {
              promoteRemoteStatus = { error: body.error || `Status API failed (${response.status})` };
            }
          } else {
            const text = await response.text().catch(() => "");
            const snippet = text.slice(0, 120).replace(/\s+/g, " ").trim();
            promoteRemoteStatus = {
              error: `Status API returned non-JSON (${response.status}, ${contentType || "unknown content-type"}). ${snippet}`,
            };
          }
        } catch (error: any) {
          promoteRemoteStatus = { error: error?.message || "Status API unavailable" };
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
      res.status(500).json({ error: error?.message || "Failed to load status" });
    }
  });

  // Staging admin: approve and promote currently staged commit to production
  app.post("/api/admin/staging/promote", authenticateToken, async (req: any, res: any) => {
    try {
      const admin = await ensureStagingAdmin(req, res);
      if (!admin.ok) return;

      const promotedBy = String(admin.user.email || admin.user.username || admin.user.id || "unknown");

      // Preferred in Docker staging: proxy to production webhook that runs host-side script.
      if (PROMOTE_PROD_WEBHOOK_URL && PROMOTE_PROD_WEBHOOK_SECRET) {
        const response = await fetch(PROMOTE_PROD_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-promote-secret": PROMOTE_PROD_WEBHOOK_SECRET,
          },
          body: JSON.stringify({ promotedBy }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          return res.status(response.status).json({ error: body.error || "Production webhook failed" });
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
      fs.writeFileSync(lockFile, JSON.stringify({ startedAt: new Date().toISOString(), by: promotedBy }, null, 2));

      // PM2 treekill kills ALL descendants. Use nohup setsid to fully escape the process tree.
      const cmd = `nohup setsid bash "${promoteScript}" </dev/null >>"${path.join(appDir, "deploy-promotion-stdout.log")}" 2>&1 &`;
      exec(cmd, {
        cwd: appDir,
        env: { ...process.env, APP_DIR: appDir, PROMOTED_BY: promotedBy, PROMOTE_LOCK_FILE: lockFile },
      });

      return res.json({ message: "Production promotion started", startedAt: new Date().toISOString() });
    } catch (error: any) {
      console.error("Failed to start production promotion:", error);
      res.status(500).json({ error: error?.message || "Failed to start promotion" });
    }
  });

  // Staging admin: cancel an in-progress promotion
  app.post("/api/admin/staging/cancel-promote", authenticateToken, async (req: any, res: any) => {
    try {
      const admin = await ensureStagingAdmin(req, res);
      if (!admin.ok) return;

      const cancelledBy = String(admin.user.email || admin.user.username || admin.user.id || "unknown");

      if (PROMOTE_PROD_WEBHOOK_URL && PROMOTE_PROD_WEBHOOK_SECRET) {
        // Proxy cancel to production
        const cancelUrl = getProdPromotionCancelUrl() || "";
        if (!cancelUrl) {
          return res.status(500).json({ error: "Could not determine production cancel URL" });
        }
        const response = await fetch(cancelUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-promote-secret": PROMOTE_PROD_WEBHOOK_SECRET,
          },
          body: JSON.stringify({ cancelledBy }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          return res.status(response.status).json({ error: body.error || "Cancel failed" });
        }
        return res.json(body);
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
      res.status(500).json({ error: error?.message || "Failed to cancel" });
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
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error"
      });
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

      // Set session data
      req.session.userId = user.id;
      req.session.user = {
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: !!user.githubId,
        googleConnected: !!user.googleId,
        emailVerified: !!user.emailVerified
      };

      // Set userId in session BEFORE saving
      req.session.userId = user.id;
      
      // Save session explicitly to ensure cookie is set
      req.session.save((err) => {
        if (err) {
          console.error('❌ Error saving session:', err);
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
      res.status(500).send("An error occurred while trying to log in");
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
              console.log("GitHub token missing 'repo' scope, clearing connection to allow reconnection");
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
      const redirectUri = process.env.APP_URL ? `${process.env.APP_URL}/api/auth/user` : "https://pushlog.ai/api/auth/user";
      const scope = "repo user:email admin:org_hook";
      
      console.log("GitHub OAuth connect - Client ID:", clientId.substring(0, 10) + "...");
      console.log("GitHub OAuth connect - Redirect URI:", redirectUri);
      
      const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
      
      // Instead of redirecting, send the URL and state back to the client
      res.status(200).json({ url, state });
    } catch (error) {
      console.error('GitHub connection initiation failed:', error);
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

      console.log(`GitHub disconnected for user ${userId}`);
      res.status(200).json({ success: true, message: "GitHub account disconnected successfully" });
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error);
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

  // Get current user info or handle GitHub OAuth
  app.get("/api/auth/user", async (req, res) => {
    try {
      // Check if this is a GitHub OAuth callback
      const code = req.query.code as string;
      const error = req.query.error as string;
      
      if (error) {
        console.error("GitHub OAuth error from callback:", error, req.query.error_description);
        return res.redirect(`/dashboard?error=github_oauth_error&message=${encodeURIComponent(error)}`);
      }
      
      if (code) {
        console.log("GitHub OAuth callback received, exchanging code for token...");
        // Handle GitHub OAuth
        let token: string;
        try {
          token = await exchangeCodeForToken(code);
          console.log("Successfully exchanged code for token");
        } catch (tokenError) {
          console.error("Failed to exchange code for token:", tokenError);
          throw new Error(`Failed to exchange GitHub authorization code: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
        }
        
        let githubUser;
        try {
          githubUser = await getGitHubUser(token);
          console.log("Successfully fetched GitHub user:", githubUser.login);
        } catch (userError) {
          console.error("Failed to get GitHub user:", userError);
          throw new Error(`Failed to fetch GitHub user info: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
        }

        // Check if there's a current session/user trying to connect
        const state = req.query.state as string;
        const currentUserId = state ? await getUserIdFromOAuthState(state) : null;
        console.log(`OAuth callback - state: ${state}, currentUserId: ${currentUserId}`);
        
        let user;
        if (currentUserId) {
          // User is already logged in and trying to connect GitHub
          console.log(`User ${currentUserId} is connecting GitHub account`);
          const currentUser = await databaseStorage.getUserById(currentUserId);
          if (currentUser) {
            // Check if GitHub account is already connected to another user
            const existingUser = await databaseStorage.getUserByGithubId(githubUser.id.toString());
            if (existingUser && existingUser.id !== currentUser.id) {
              return res.redirect(`/dashboard?error=github_already_connected&message=${encodeURIComponent('This GitHub account is already connected to another PushLog account. Please use a different GitHub account or contact support.')}`);
            }
            
            // Update current user's GitHub connection
            user = await databaseStorage.updateUser(currentUser.id, {
              githubId: githubUser.id.toString(),
              githubToken: token,
              email: githubUser.email || currentUser.email,
              emailVerified: true
            });
            console.log(`Updated user ${currentUser.id} with GitHub connection`);
          }
        } else {
          // No current session - this is a login flow
          console.log(`No current session - checking for existing user with GitHub ID ${githubUser.id}`);
          // No current session - check if user already exists with this GitHub ID
          const existingUser = await databaseStorage.getUserByGithubId(githubUser.id.toString());
          if (existingUser) {
            // Log in existing user
            console.log(`Found existing user ${existingUser.id}, logging in`);
            user = await databaseStorage.updateUser(existingUser.id, {
              githubToken: token, // Update token in case it changed
              email: githubUser.email || existingUser.email,
              emailVerified: true
            });
          } else {
            // Check if user exists with this username (from previous signup)
            console.log(`Checking for existing user with username: ${githubUser.login}`);
            const existingUserByUsername = await databaseStorage.getUserByUsername(githubUser.login);
            if (existingUserByUsername) {
              // User exists with this username but no GitHub connection - update it
              console.log(`Found existing user ${existingUserByUsername.id} with username ${githubUser.login}, connecting GitHub`);
              user = await databaseStorage.updateUser(existingUserByUsername.id, {
                githubId: githubUser.id.toString(),
                githubToken: token,
                email: githubUser.email || existingUserByUsername.email,
                emailVerified: true
              });
              console.log(`Updated user ${existingUserByUsername.id} with GitHub connection`);
            } else {
              // Create new user - but wrap in try-catch to handle race conditions
              console.log(`No existing user found, creating new user for GitHub user ${githubUser.login}`);
              try {
                user = await databaseStorage.createUser({
                  username: githubUser.login,
                  email: githubUser.email,
                  githubId: githubUser.id.toString(),
                  githubToken: token,
                  emailVerified: true
                });
                console.log(`Created new user ${user?.id}`);
              } catch (createError: any) {
                // If username already exists (race condition or check missed it), find and update
                console.error(`Error creating user:`, createError.message);
                if (createError.message && (createError.message.includes('users_username_key') || createError.message.includes('duplicate key'))) {
                  console.log(`Username conflict detected, finding existing user by username: ${githubUser.login}`);
                  const conflictUser = await databaseStorage.getUserByUsername(githubUser.login);
                  if (conflictUser) {
                    console.log(`Found conflicting user ${conflictUser.id}, updating with GitHub connection`);
                    user = await databaseStorage.updateUser(conflictUser.id, {
                      githubId: githubUser.id.toString(),
                      githubToken: token,
                      email: githubUser.email || conflictUser.email,
                      emailVerified: true
                    });
                    console.log(`Updated existing user ${conflictUser.id} with GitHub connection`);
                  } else {
                    console.error(`Username conflict but couldn't find user - this shouldn't happen`);
                    throw createError;
                  }
                } else {
                  throw createError;
                }
              }
            }
          }
        }

        if (!user || !user.id) {
          console.error("Failed to create/update user. User object:", user);
          throw new Error('Failed to create or update user properly');
        }

        console.log(`Successfully created/updated user ${user.id} with GitHub ID ${githubUser.id}`);
        
        req.session.userId = user.id;
        req.session.user = {
          userId: user.id,
          username: user.username || '',
          email: user.email || null,
          githubConnected: true,
          googleConnected: !!user.googleId,
          emailVerified: true
        };

        // Redirect to dashboard; if they were connecting GitHub from Settings, add param so client refetches repos
        const redirectUrl = currentUserId ? `/dashboard?github_connected=1` : `/dashboard`;
        console.log(`Redirecting to dashboard for user ${user.id} (session-based auth)`);
        return res.redirect(redirectUrl);
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

  // Add Google OAuth callback route
  app.get("/api/google/user", async (req, res) => {
    try {
      const code = req.query.code as string;
      const token = await exchangeGoogleCodeForToken(code);
      const googleUser = await getGoogleUser(token);

      // Try to find existing user
      let user = await databaseStorage.getUserByEmail(googleUser.email);
      let isNewUser = false;
      
      if (!user) {
        isNewUser = true;
        
        // Generate a unique username from email
        let baseUsername = googleUser.email.split('@')[0];
        let username = baseUsername;
        let counter = 1;

        // Keep trying until we find a unique username
        while (true) {
          try {
            const existingUser = await databaseStorage.getUserByUsername(username);
            if (!existingUser) {
              break; // Username is available
            }
            username = `${baseUsername}${counter}`; // Add number suffix
            counter++;
          } catch (error) {
            console.error("Error checking username:", error);
            throw error;
          }
        }

        // Generate email verification token for new Google users
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Create new user if they don't exist (unverified initially)
        user = await databaseStorage.createUser({
          username: username, // Use the unique username we generated
          email: googleUser.email,
          googleId: googleUser.id,
          googleToken: token,
          emailVerified: false, // Google OAuth users still need to verify email
          verificationToken,
          verificationTokenExpiry: verificationTokenExpiry.toISOString(),
        });

        // Send verification email for new Google OAuth users
        try {
          await sendVerificationEmail(googleUser.email, verificationToken);
          
          // Create notification for email verification
          try {
            await storage.createNotification({
              userId: user.id,
              type: 'email_verification',
              title: 'Email Verification Required',
              message: 'Please check your email and verify your address to access all features'
            });
          } catch (notificationError) {
            console.error('Failed to create verification notification:', notificationError);
          }
        } catch (emailError) {
          console.error('Failed to send verification email to Google OAuth user:', emailError);
          // Don't fail the OAuth flow if email sending fails
        }
      } else {
        // Update existing user's Google token
        user = await databaseStorage.updateUser(user.id, {
          googleToken: token,
          googleId: googleUser.id, // Make sure to update the Google ID as well
        });
      }

      if (!user) {
        throw new Error("Failed to create or update user");
      }

      
      req.session.userId = user.id;
      req.session.user = {
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: !!user.githubId,
        googleConnected: true,
        emailVerified: !!user.emailVerified
      };

      // Redirect to dashboard - no token needed, cookie is set automatically
      res.redirect(`/dashboard`);
    } catch (error) {
      console.error("Google auth error:", error);
      res.status(500).json({ error: "Authentication failed" });
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
      req.session.user = {
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: false,
        googleConnected: false,
        emailVerified: false
      };

      res.status(200).json({
        success: true,
        // No token needed - cookie is set automatically
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
      req.session.user = {
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: !!user.githubId,
        googleConnected: !!user.googleId,
        emailVerified: true  // Updated to true after verification
      };

      res.status(200).json({
        success: true,
        // No token needed - session is set/updated automatically
        message: "Email verified successfully"
      });
    } catch (error) {
      console.error("Email verification error:", error);
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
   * (server/index.ts session config). Mismatch (e.g. sameSite/strict vs lax, or
   * missing path/domain) can prevent the browser from clearing the cookie (AUTH-VULN-03).
   */
  function clearLogoutCookie(res: Response): void {
    const opts: Parameters<Response["clearCookie"]>[1] = {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    };
    if (process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
    res.clearCookie("connect.sid", opts);
  }

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
      res.status(500).json({ error: "Failed to fetch repositories" });
    }
  });

  // Get push events for repositories (single query, limit 100)
  app.get("/api/push-events", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const offset = Number(req.query.offset) || 0;
      const allPushEvents = await storage.getPushEventsForUser(userId, { limit, offset });

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

      res.status(200).json(formattedEvents);
    } catch (error) {
      console.error("Failed to fetch push events:", error);
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
  ], authenticateToken, requireEmailVerification, async (req: any, res: any) => {
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
    body('monitorAllBranches').optional().isBoolean().withMessage('monitorAllBranches must be a boolean')
  ], authenticateToken, async (req: any, res: any) => {
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
      
      const updates = req.body;
      
      // First verify user owns this repository
      const existingRepository = await storage.getRepository(repositoryId);
      if (!existingRepository) {
        return res.status(404).json({ error: "Repository not found" });
      }
      
      if (existingRepository.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const repository = await storage.updateRepository(repositoryId, updates);
      
      if (!repository) {
        return res.status(404).json({ error: "Repository not found" });
      }

      // If repository isActive status is being updated, also update related integrations
      if (updates.hasOwnProperty('isActive')) {
        // Get all integrations for this user and filter by repository ID
        const userId = req.user?.userId;
        if (userId) {
          const userIntegrations = await storage.getIntegrationsByUserId(userId);
          const relatedIntegrations = userIntegrations.filter(integration => integration.repositoryId === repositoryId);
          
          // Update all integrations for this repository to match the repository's active status
          for (const integration of relatedIntegrations) {
            await storage.updateIntegration(integration.id, {
              isActive: updates.isActive
            });
          }
        }
      }

      res.status(200).json(repository);
    } catch (error) {
      console.error("Error updating repository:", error);
      res.status(500).json({ error: "Failed to update repository" });
    }
  });

  // Disconnect a repository
  app.delete("/api/repositories/:id", authenticateToken, async (req, res) => {
    try {
      const repositoryId = req.params.id;
      const repository = await storage.getRepository(repositoryId);
      
      if (!repository) {
        return res.status(404).json({ error: "Repository not found" });
      }

      // Verify user owns this repository
      if (repository.userId !== req.user!.userId) {
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

      // Check if workspace already exists for this user
      const existingWorkspace = await databaseStorage.getSlackWorkspaceByTeamId(slackData.team.id);
      
      if (existingWorkspace && existingWorkspace.userId === session.userId) {
        // Update existing workspace
        await databaseStorage.updateSlackWorkspace(existingWorkspace.id, {
          accessToken: slackData.access_token,
          teamName: slackData.team.name
        });
      } else {
        // Create new workspace
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
      res.status(500).json({ error: 'Failed to fetch Slack channels' });
    }
  });

  // Create integration
  app.post("/api/integrations", authenticateToken, async (req, res) => {
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
      
      // Ensure repository exists and belongs to the user
      const repository = await storage.getRepository(validatedData.repositoryId);
      if (!repository) {
        return res.status(404).json({ error: "Repository not found", details: "The selected repository does not exist." });
      }
      if (repository.userId !== userId) {
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
        console.log("Validation failed:", message);
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
      const enrichedIntegrations = integrations.map((integration: any) => {
        const repoId = integration.repositoryId ?? null;
        const repository = repoId != null ? repoById.get(repoId) : null;
        const sanitized = sanitizeIntegrationForClient(integration);
        return {
          ...sanitized,
          repositoryName: repository?.name ?? "Unknown Repository",
          lastUsed: integration.createdAt ?? null,
          status: integration.isActive ? "active" : "paused",
          notificationLevel: integration.notificationLevel ?? "all",
          includeCommitSummaries: integration.includeCommitSummaries ?? true,
        };
      });

      res.setHeader("Cache-Control", "private, max-age=15");
      res.status(200).json(enrichedIntegrations);
    } catch (error) {
      console.error("Error fetching integrations:", error);
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
        }));
        const repoById = new Map(connectedRepos.map((r) => [r.id, r]));
        const enrichedIntegrations = (Array.isArray(integrations) ? integrations : []).map((integration: any) => {
          const repoId = integration.repositoryId ?? null;
          const repository = repoId != null ? repoById.get(repoId) : null;
          const sanitized = sanitizeIntegrationForClient(integration);
          return {
            ...sanitized,
            repositoryName: repository?.name ?? "Unknown Repository",
            lastUsed: integration.createdAt ?? null,
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
        };
      });
      const repoById = new Map(connectedRepos.map((r) => [r.id, r]));
      const enrichedIntegrations = (Array.isArray(integrations) ? integrations : []).map((integration: any) => {
        const repoId = integration.repositoryId ?? null;
        const repository = repoId != null ? repoById.get(repoId) : null;
        const sanitized = sanitizeIntegrationForClient(integration);
        return {
          ...sanitized,
          repositoryName: repository?.name ?? "Unknown Repository",
          lastUsed: integration.createdAt ?? null,
          status: integration.isActive ? "active" : "paused",
          notificationLevel: integration.notificationLevel ?? "all",
          includeCommitSummaries: integration.includeCommitSummaries ?? true,
        };
      });
      res.setHeader("Cache-Control", "private, max-age=15");
      return res.status(200).json({ repositories, integrations: enrichedIntegrations });
    } catch (error) {
      console.error("Error fetching repositories and integrations:", error);
      res.status(500).json({ error: "Failed to fetch data" });
    }
  });

  // app.post("/api/ai/add-open-router-key", authenticateToken, async (req, res) => {
    
  // });

  // Update integration
  app.patch("/api/integrations/:id", authenticateToken, async (req, res) => {
    try {
      const integrationId = req.params.id;
      const updates = { ...req.body };
      
      // OpenRouter API key: encrypt before storing; never send raw key to DB
      if (updates.openRouterApiKey !== undefined) {
        updates.openRouterApiKey = typeof updates.openRouterApiKey === 'string' && updates.openRouterApiKey.trim()
          ? encrypt(updates.openRouterApiKey.trim())
          : null;
      }
      
      console.log(`📝 Updating integration ${integrationId} with:`, JSON.stringify({ ...updates, openRouterApiKey: updates.openRouterApiKey ? '[REDACTED]' : updates.openRouterApiKey }, null, 2));
      
      // First verify user owns this integration
      const existingIntegration = await storage.getIntegration(integrationId);
      if (!existingIntegration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      if (existingIntegration.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      console.log(`📊 Current integration ai_model: ${existingIntegration.aiModel}`);
      
      const integration = await storage.updateIntegration(integrationId, updates);
      
      console.log(`✅ Updated integration ai_model: ${integration?.aiModel}`);
      
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      // If AI model is being updated, also update user's preferred AI model
      // This keeps them in sync for future integrations
      if (updates.aiModel) {
        await databaseStorage.updateUser(req.user!.userId, {
          preferredAiModel: updates.aiModel
        });
        console.log(`📝 Updated user ${req.user!.userId} preferred_ai_model to ${updates.aiModel}`);
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
      console.log(`OpenRouter API key saved for user ${userId} (encrypted length ${stored.length})`);
      // #region agent log
      // #endregion
      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("OpenRouter save key error:", err);
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
      res.status(500).json({ error: 'Failed to update OpenRouter usage', details: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // OpenRouter: remove user's saved key
  app.delete("/api/openrouter/key", authenticateToken, async (req, res) => {
    try {
      await databaseStorage.updateUser(req.user!.userId, { openRouterApiKey: null } as any);
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("OpenRouter remove key error:", err);
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
      res.status(500).json({ error: "Failed to load usage" });
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
      const models = (data.data || []).map((m: any) => ({
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
      res.status(500).json({ error: msg || "Failed to send test message to Slack." });
    }
  });

  // Delete integration
  app.delete("/api/integrations/:id", authenticateToken, async (req, res) => {
    try {
      const integrationId = req.params.id;
      
      // First get the integration to verify ownership
      const integration = await storage.getIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      // Verify user owns this integration
      if (integration.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const success = await storage.deleteIntegration(integrationId);
      
      if (!success) {
        return res.status(404).json({ error: "Integration not found" });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting integration:", error);
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
      
      console.log(`🧪 Test AI Summary - Model: ${testModel}, Body:`, JSON.stringify(req.body));
      
      // Get user's first active integration for testing (if not using direct model)
      let activeIntegration = null;
      if (!testModel) {
        console.log('🔍 No model provided, checking for active integration...');
        const userIntegrations = await storage.getIntegrationsByUserId(userId);
        activeIntegration = userIntegrations.find(integration => integration.isActive);
        
        if (!activeIntegration) {
          return res.status(400).json({ error: "No active integrations found. Please create an integration first." });
        }
      } else {
        console.log(`✅ Using direct model parameter: ${testModel}`);
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
              console.log(`✅ Test Slack message sent to channel ${integrationToUse.slackChannelName} using model ${aiModel}`);
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

      console.log(`🧪 [TEST] Simulate push: ${repo.fullName} @ ${pushData.branch} → Slack #${integration.slackChannelName}`);

      const integrationAiModel = (integration as any).aiModel ?? (integration as any).ai_model;
      const aiModelStr = (typeof integrationAiModel === "string" && integrationAiModel.trim()) ? integrationAiModel.trim() : "gpt-4o";
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

      console.log(`🧪 [TEST] Sending Slack notification to ${integration.slackChannelName}...`);
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
        console.log(`🧪 [TEST] ✅ AI Slack message sent. Timestamp: ${ts}`);
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
        console.log(`🧪 [TEST] ✅ Regular Slack message sent. Timestamp: ${ts}`);
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
      res.status(500).json({
        error: err instanceof Error ? err.message : "Simulate push failed",
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
          monthlyBudget: user.monthlyBudget ?? null,
          overBudgetBehavior: (user as any).overBudgetBehavior === "free_model" ? "free_model" : "skip_ai",
          preferredAiModel: (user as any).preferredAiModel ?? "gpt-5.2",
        }
      };
      res.status(200).json(payload);
    } catch (error: any) {
      console.error("Profile error:", error?.message ?? error);
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
      const body = req.body as { preferredAiModel?: string; overBudgetBehavior?: string };
      const updates: Record<string, unknown> = {};
      if (body.overBudgetBehavior && body.overBudgetBehavior === "free_model" || body.overBudgetBehavior === "skip_ai") {
        updates.overBudgetBehavior = body.overBudgetBehavior;
      }
      if (body.preferredAiModel) {
        updates.preferredAiModel = body.preferredAiModel;
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid updates" });
      }
      const user = await databaseStorage.updateUser(userId, updates as any);
      if (!user) return res.status(404).json({ error: "User not found" });
      const resBody: { success: boolean; preferredAiModel?: string; overBudgetBehavior?: string } = { success: true };
      if (updates.preferredAiModel !== undefined) resBody.preferredAiModel = (user as any).preferredAiModel;
      if (updates.overBudgetBehavior !== undefined) resBody.overBudgetBehavior = (user as any).overBudgetBehavior;
      res.status(200).json(resBody);
    } catch (error) {
      console.error("Error updating user:", error);
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
        throw new Error("User not found");
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
        throw new Error("User not found");
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
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });

  // Mark a specific notification as read
  app.post("/api/notifications/mark-read/:id", authenticateToken, async (req, res) => {
    try {
      const notificationId = req.params.id;
      const userId = req.user!.userId;
      
      console.log(`📖 Marking notification ${notificationId} as read for user ${userId}`);
      
      // Verify the notification belongs to the user (single row lookup)
      const notification = await storage.getNotificationByIdAndUserId(notificationId, userId);
      
      if (!notification) {
        console.error(`❌ Notification ${notificationId} not found for user ${userId}`);
        return res.status(404).json({ error: "Notification not found" });
      }
      
      console.log(`✅ Found notification ${notificationId}, current isRead: ${notification.isRead}`);
      
      // Mark as read
      const updated = await storage.markNotificationAsRead(notificationId);
      
      if (!updated) {
        console.error(`❌ Failed to update notification ${notificationId}`);
        return res.status(500).json({ error: "Failed to mark notification as read" });
      }
      
      console.log(`✅ Notification ${notificationId} marked as read. Updated isRead: ${updated.isRead}`);
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("❌ Error marking notification as read:", error);
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
        res.status(200).json({ success: true });
      } else {
        res.status(404).json({ error: "Notification not found" });  
      }
    } catch (error) {
        console.error("Error deleting notification:", error);
        res.status(500).json({ error: "Failed to delete notification" });
      }
  })

  // Clear all notifications for a user
  app.delete("/api/notifications/clear-all", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const deletedCount = await storage.getNotificationCountForUser(userId);
      await storage.deleteAllNotifications(userId);
      res.status(200).json({ success: true, deletedCount });
    } catch (error) {
      console.error("❌ [SERVER] Error clearing notifications:", error);
      res.status(500).json({ error: "Failed to clear notifications" });
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
      await databaseStorage.updateUser(userId, { password: hashedPassword });

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
      
      console.log(`📦 [GDPR] User ${userId} requested data export`);
      
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
      
      console.log(`🗑️ [GDPR] User ${userId} requested account deletion`);
      
      const result = await databaseStorage.deleteUserAccount(userId);
      
      if (result.success) {
        console.log(`✅ [GDPR] Account deleted for user ${userId}:`, result.deletedData);
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
