/**
 * Sentry webhook handling: parse event, ingest incident, resolve source map,
 * and send direct notifications. Expects req.body to be already parsed
 * (signature verified in index with raw body).
 */

import type { Request, Response } from "express";
import { storage } from "./storage";
import broadcastNotification from "./helper/broadcastNotification";
import { sendIncidentAlertEmail } from "./email";
import { resolveToSource } from "./helper/sourceMapResolve";
import {
  ingestIncidentEvent,
  type IncidentEventInput,
} from "./incidentEngine";

const APP_ENV = process.env.APP_ENV || "production";

function parseCsvEnv(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const STAGING_ADMIN_EMAILS = parseCsvEnv(process.env.STAGING_ADMIN_EMAILS);
const STAGING_ADMIN_USERNAMES = parseCsvEnv(process.env.STAGING_ADMIN_USERNAMES);

/** Dedupe: Sentry sends 2+ webhooks per error (event alert + issue.created). Skip duplicate direct notifications. */
const recentSentryDedupeKeys = new Map<string, number>();
const DEDUPE_WINDOW_MS = 90_000;

/** Build a dedupe key from issue id, event id, or both. Prefer issue_id (same across webhooks for same error). */
function getDedupeKey(issue: any, ev: any): string | undefined {
  const issueId = issue?.id != null ? String(issue.id) : undefined;
  const eventId = ev?.event_id ?? ev?.id;
  const eventIdStr = eventId != null ? String(eventId) : undefined;
  if (issueId) return `issue:${issueId}`;
  if (eventIdStr) return `event:${eventIdStr}`;
  return undefined;
}

function shouldSkipDirectNotification(
  dedupeKey: string | undefined,
  action: string | undefined,
  hasEvent: boolean
): boolean {
  const now = Date.now();
  // Prune stale entries
  const toDelete: string[] = [];
  recentSentryDedupeKeys.forEach((ts, id) => {
    if (now - ts > DEDUPE_WINDOW_MS) toDelete.push(id);
  });
  toDelete.forEach((id) => recentSentryDedupeKeys.delete(id));
  if (dedupeKey && recentSentryDedupeKeys.has(dedupeKey)) return true;
  // Issue-only webhook (action=created, no event): skip — incident engine will emit "new_issue"
  if (action === "created" && !hasEvent) return true;
  return false;
}

function recordSentNotification(issue: any, ev: any): void {
  const now = Date.now();
  const issueId = issue?.id != null ? String(issue.id) : undefined;
  const eventId = ev?.event_id ?? ev?.id;
  const eventIdStr = eventId != null ? String(eventId) : undefined;
  if (issueId) recentSentryDedupeKeys.set(`issue:${issueId}`, now);
  if (eventIdStr) recentSentryDedupeKeys.set(`event:${eventIdStr}`, now);
}

/** Used by routes to skip incident-engine "new_issue" when we just sent from Sentry webhook. */
const recentSentryByServiceEnv = new Map<string, number>();
const SENTRY_SUPPRESS_INCIDENT_WINDOW_MS = 45_000;

export function recordRecentSentryNotification(service: string, environment: string): void {
  const key = `${service}:${environment}`;
  recentSentryByServiceEnv.set(key, Date.now());
}

export function wasRecentSentryNotification(service: string, environment: string): boolean {
  const key = `${service}:${environment}`;
  const ts = recentSentryByServiceEnv.get(key);
  if (!ts) return false;
  if (Date.now() - ts > SENTRY_SUPPRESS_INCIDENT_WINDOW_MS) {
    recentSentryByServiceEnv.delete(key);
    return false;
  }
  return true;
}

/** Get user IDs that should receive incident notifications. */
export async function getIncidentNotificationTargets(
  isTestNotification: boolean = false
): Promise<string[]> {
  const configuredIds = (process.env.INCIDENT_NOTIFY_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (configuredIds.length > 0) {
    return configuredIds;
  }

  if (isTestNotification && APP_ENV === "staging" && process.env.SENTRY_TEST_NOTIFY_ALL !== "true") {
    const allUsers = await storage.getAllUserIds();
    const stagingAdmins: string[] = [];

    for (const userId of allUsers) {
      const user = await storage.getUser(userId);
      if (!user) continue;

      const email = String(user.email || "").toLowerCase();
      const username = String(user.username || "").toLowerCase();
      const isAdmin =
        (email && STAGING_ADMIN_EMAILS.includes(email)) ||
        (username && STAGING_ADMIN_USERNAMES.includes(username));

      if (isAdmin) {
        stagingAdmins.push(userId);
      }
    }

    console.log(`[incident-notify] Staging test mode: notifying ${stagingAdmins.length} admin(s) only`);
    return stagingAdmins;
  }

  if (isTestNotification && process.env.SENTRY_TEST_NOTIFY_ALL !== "true") {
    const allUsers = await storage.getAllUserIds();
    const usersWithRepos: string[] = [];

    for (const userId of allUsers) {
      const repos = await storage.getRepositoriesByUserId(userId);
      if (repos.length > 0) {
        usersWithRepos.push(userId);
      }
    }

    console.log(
      `[incident-notify] Test mode: notifying ${usersWithRepos.length}/${allUsers.length} users (those with repos)`
    );
    return usersWithRepos;
  }

  const allUserIds = await storage.getAllUserIds();
  return allUserIds;
}

export async function handleSentryWebhook(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const bodyKeys = body ? Object.keys(body) : [];
  console.log("[webhooks/sentry] Request received", { bodyKeys, hasData: !!body?.data });
  try {
    const data = body?.data as Record<string, unknown> | undefined;
    const ev = data?.event as Record<string, unknown> | undefined;
    const issue = data?.issue as Record<string, unknown> | undefined;

    if (!ev && !issue) {
      const action = String(body?.action ?? "test").trim() || "test";
      console.log("[webhooks/sentry] Test/minimal payload (no event/issue), sending test notification");
      const targetUserIds = await getIncidentNotificationTargets(true);
      const targetUsers = new Set<string>(targetUserIds);
      const appEnv = process.env.APP_ENV || process.env.NODE_ENV || "production";
      const directTitle = "Sentry test notification";
      const directMessage = `Webhook received (action: ${action}). If you see this, the Sentry → PushLog integration is working. [${appEnv}]`;

      await Promise.all(
        Array.from(targetUsers).map(async (userId) => {
          try {
            const notif = await storage.createNotification({
              userId,
              type: "incident_alert",
              title: directTitle,
              message: directMessage,
              metadata: JSON.stringify({ source: "sentry_test", action, appEnv }),
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
            const user = await storage.getUser(userId);
            if (user?.email && (user as any).incidentEmailEnabled !== false) {
              void sendIncidentAlertEmail(user.email, directTitle, directMessage);
            }
          } catch (err) {
            console.warn("[webhooks/sentry] failed test notify:", err);
          }
        })
      );
      console.log(`[webhooks/sentry] Test notification sent to ${targetUsers.size} users`);
      res.status(202).json({ accepted: true });
      return;
    }

    const exception = ev?.exception as Record<string, unknown> | undefined;
    const firstExc = exception?.values as Array<Record<string, unknown>> | undefined;
    const first = firstExc?.[0];
    const stacktraceFrames =
      ((first?.stacktrace as Record<string, unknown>)?.frames as Array<Record<string, unknown>> | undefined) ?? [];
    const stacktrace = stacktraceFrames
      .map((f) => {
        const file = String(f.filename || f.abs_path || "unknown").trim() || "unknown";
        const fn = String(f.function || f.raw_function || "");
        return { file, function: fn, line: f.lineno as number | undefined, colno: f.colno as number | undefined };
      })
      .filter((f) => f.file !== "unknown" && f.file.length > 0);
    if (stacktrace.length === 0) {
      stacktrace.push({ file: "sentry", function: ev ? "event_alert" : "issue_alert", line: undefined, colno: undefined });
    }

    const issueLevel = String((issue as any)?.level || "").toLowerCase();
    const level = String((ev as any)?.level || issueLevel || "error").toLowerCase();
    const severity =
      level === "fatal" || level === "critical" ? "critical" : level === "warning" ? "warning" : "error";

    let timestamp = ev?.datetime as string | undefined;
    if (!timestamp && typeof (ev as any)?.timestamp === "number") {
      timestamp = new Date(((ev as any).timestamp as number) * 1000).toISOString();
    }
    if (!timestamp) {
      timestamp =
        String((issue as any)?.lastSeen || (issue as any)?.firstSeen || "").trim() || undefined;
    }
    if (!timestamp) timestamp = new Date().toISOString();

    const tags =
      (ev?.tags as Array<[string, string]> | Record<string, string> | undefined) ||
      ((issue as any)?.tags as Array<[string, string]> | Record<string, string> | undefined);
    let environment = "production";
    if (Array.isArray(tags)) {
      const envTag = tags.find((t) => t[0] === "environment");
      if (envTag?.[1]) environment = envTag[1];
    } else if (tags && typeof tags === "object" && tags.environment) {
      environment = String(tags.environment);
    }
    if (environment.toLowerCase() === "production") environment = "prod";
    const proj = data?.project as Record<string, unknown> | string | number | undefined;
    const projectSlug =
      (typeof proj === "object" && proj?.slug ? String(proj.slug) : "") ||
      (typeof (ev as any)?.project === "string" ? (ev as any).project : "") ||
      (typeof (issue as any)?.project?.slug === "string" ? String((issue as any).project.slug) : "") ||
      "api";
    const service = projectSlug || "api";

    const issueMeta = ((issue as any)?.metadata || {}) as Record<string, unknown>;
    const evMeta = ((ev as any)?.metadata || {}) as Record<string, unknown>;
    const event: IncidentEventInput = {
      source: "sentry",
      service,
      environment,
      timestamp,
      severity,
      exception_type: String(first?.type ?? evMeta?.type ?? issueMeta?.type ?? "Error"),
      message: String(
        first?.value ??
          (ev as any)?.title ??
          evMeta?.value ??
          issueMeta?.value ??
          (issue as any)?.title ??
          "Unknown error"
      ),
      stacktrace,
      links: ((ev as any)?.web_url || (issue as any)?.webUrl || (issue as any)?.permalink)
        ? { source_url: String((ev as any)?.web_url || (issue as any)?.webUrl || (issue as any)?.permalink) }
        : undefined,
    };
    ingestIncidentEvent(event);
    console.log(`[webhooks/sentry] Ingested: ${event.exception_type} in ${service}/${environment}`);

    const dedupeKey = getDedupeKey(issue as any, ev as any);
    const action = body?.action != null ? String(body.action) : undefined;
    if (shouldSkipDirectNotification(dedupeKey, action, !!ev)) {
      console.log("[webhooks/sentry] Skipping duplicate direct notification", { dedupeKey, action });
      res.status(202).json({ accepted: true });
      return;
    }

    const targetUserIds = await getIncidentNotificationTargets(false);
    const targetUsers = new Set<string>(targetUserIds);

    const directTitle = `Sentry: ${event.exception_type} in ${service}/${environment}`;
    const directMessage = ev
      ? `${event.message} (${severity})`
      : `${String(body?.action || "Alert")} from Sentry`;

    let apiRoute: string | undefined;
    let requestUrl: string | undefined;
    let culprit: string | undefined;
    if (ev) {
      const req = ev.request as Record<string, unknown> | undefined;
      const url = req?.url as string | undefined;
      if (url) {
        try {
          const parsed = new URL(url);
          apiRoute = parsed.pathname || undefined;
          requestUrl = url;
        } catch {
          apiRoute = url;
        }
      }
      const appFrames = stacktrace.filter((f) => f.file && !String(f.file).includes("node_modules"));
      const culpritFrame = appFrames.length > 0 ? appFrames[appFrames.length - 1] : undefined;
      if (culpritFrame) {
        culprit =
          culpritFrame.line != null
            ? `${String(culpritFrame.file).replace(/^.*[\\/]/, "")}:${culpritFrame.line}`
            : culpritFrame.file;
      }
    }

    let culpritSource: string | undefined;
    if (culprit && ev) {
      const appFrames = stacktrace.filter((f) => f.file && !String(f.file).includes("node_modules"));
      const culpritFrame = appFrames.length > 0 ? appFrames[appFrames.length - 1] : undefined;
      if (culpritFrame?.file && culpritFrame.line != null) {
        culpritSource =
          (await resolveToSource(culpritFrame.file, culpritFrame.line, culpritFrame.colno ?? 0)) ??
          undefined;
      }
    }

    const directMeta = JSON.stringify({
      source: ev ? "sentry_event_alert" : "sentry_issue_alert",
      service,
      environment,
      severity,
      links: event.links || {},
      apiRoute,
      requestUrl,
      culprit,
      culpritSource,
      stacktrace,
    });

    await Promise.all(
      Array.from(targetUsers).map(async (userId) => {
        try {
          const notif = await storage.createNotification({
            userId,
            type: "incident_alert",
            title: directTitle,
            message: directMessage,
            metadata: directMeta,
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
          // No email here — incident engine will send one combined email with Sentry + spike/new_issue/regression info
        } catch (err) {
          console.warn("[webhooks/sentry] failed direct notify:", err);
        }
      })
    );
    recordSentNotification(issue as any, ev as any);
    recordRecentSentryNotification(service, environment);
    console.log(`[webhooks/sentry] Direct notification sent to ${targetUsers.size} users`);

    res.status(202).json({ accepted: true });
  } catch (error) {
    console.error("Sentry webhook error:", error);
    res.status(500).json({ error: "Failed to process Sentry webhook" });
  }
}
