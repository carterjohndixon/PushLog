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

/** Get user IDs that should receive incident notifications for a given org.
 * Uses organization_incident_settings when present; otherwise defaults to users_with_repos (members who have at least one repo + receiveIncidentNotifications).
 */
export async function getIncidentNotificationTargetsForOrg(
  orgId: string,
  isTestNotification: boolean = false
): Promise<string[]> {
  const settings = await storage.getOrganizationIncidentSettings(orgId);
  const mode = settings?.targetingMode ?? "users_with_repos";
  const includeViewers = settings?.includeViewers ?? false;
  const membersWithUsers = await storage.getOrganizationMembersWithUsers(orgId);
  const members = membersWithUsers.map((m) => ({ userId: m.userId, role: m.role }));

  let candidateUserIds: string[] = [];

  if (mode === "all_members") {
    candidateUserIds = members
      .filter((m) => includeViewers || m.role !== "viewer")
      .map((m) => m.userId);
  } else if (mode === "specific_users") {
    const byId = new Set<string>(settings?.specificUserIds ?? []);
    const byRole = (settings?.specificRoles ?? []).map((r) => r.toLowerCase());
    for (const m of members) {
      if (byId.has(m.userId)) candidateUserIds.push(m.userId);
      else if (byRole.length > 0 && byRole.includes(m.role)) candidateUserIds.push(m.userId);
    }
    if (!includeViewers) {
      candidateUserIds = candidateUserIds.filter((id) => {
        const m = members.find((x) => x.userId === id);
        return !m || m.role !== "viewer";
      });
    }
  } else {
    // users_with_repos (default): members who have at least one repo in the org
    const orgRepos = await storage.getRepositoriesByOrganizationId(orgId);
    const userIdsWithRepos = new Set<string>(orgRepos.map((r) => (r as any).userId));
    for (const m of members) {
      if (m.role === "viewer" && !includeViewers) continue;
      if (userIdsWithRepos.has(m.userId)) candidateUserIds.push(m.userId);
    }
  }

  // Per-user opt-out: only users with receiveIncidentNotifications !== false
  const withOptOut: string[] = [];
  for (const userId of candidateUserIds) {
    const user = await storage.getUser(userId);
    if (user && (user as any).receiveIncidentNotifications !== false) withOptOut.push(userId);
  }

  // Priority order: if priority_user_ids set, notify in that order, then the rest
  const priorityIds = settings?.priorityUserIds ?? [];
  if (priorityIds.length > 0) {
    const ordered = priorityIds.filter((id) => withOptOut.includes(id));
    const rest = withOptOut.filter((id) => !priorityIds.includes(id));
    return [...ordered, ...rest];
  }
  return withOptOut;
}

/** Get user IDs that should receive incident notifications.
 * Only users who have at least one repo and have "Receive incident notifications" on (Settings).
 */
export async function getIncidentNotificationTargets(
  isTestNotification: boolean = false
): Promise<string[]> {
  if (isTestNotification && APP_ENV === "staging" && process.env.SENTRY_TEST_NOTIFY_ALL !== "true") {
    const allUsers = await storage.getAllUserIds();
    const stagingAdmins: string[] = [];

    for (const userId of allUsers) {
      const user = await storage.getUser(userId);
      if (!user || (user as any).receiveIncidentNotifications === false) continue;

      const email = String(user.email || "").toLowerCase();
      const username = String(user.username || "").toLowerCase();
      const isAdmin =
        (email && STAGING_ADMIN_EMAILS.includes(email)) ||
        (username && STAGING_ADMIN_USERNAMES.includes(username));

      if (isAdmin) {
        stagingAdmins.push(userId);
      }
    }

    return stagingAdmins;
  }

  if (isTestNotification && process.env.SENTRY_TEST_NOTIFY_ALL !== "true") {
    const allUsers = await storage.getAllUserIds();
    const usersWithRepos: string[] = [];

    for (const userId of allUsers) {
      const [user, repos] = await Promise.all([
        storage.getUser(userId),
        storage.getRepositoriesByUserId(userId),
      ]);
      if (user && (user as any).receiveIncidentNotifications !== false && repos.length > 0) {
        usersWithRepos.push(userId);
      }
    }
    return usersWithRepos;
  }

  // Default: only users who have at least one repo and have not opted out of incident notifications
  const allUserIds = await storage.getAllUserIds();
  const usersWithRepos: string[] = [];
  for (const userId of allUserIds) {
    const [user, repos] = await Promise.all([
      storage.getUser(userId),
      storage.getRepositoriesByUserId(userId),
    ]);
    if (user && (user as any).receiveIncidentNotifications !== false && repos.length > 0) {
      usersWithRepos.push(userId);
    }
  }
  return usersWithRepos;
}

export async function handleSentryWebhook(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const bodyKeys = body ? Object.keys(body) : [];
  try {
    const data = body?.data as Record<string, unknown> | undefined;
    const ev = data?.event as Record<string, unknown> | undefined;
    const issue = data?.issue as Record<string, unknown> | undefined;

    if (!ev && !issue) {
      const action = String(body?.action ?? "test").trim() || "test";
      // Use org incident settings for test so configured owner/developer receive it; fallback to legacy (staging admins or users with repos)
      let targetUserIds: string[] = [];
      try {
        const orgIds = await storage.getAllOrganizationIds();
        const seen = new Set<string>();
        for (const orgId of orgIds) {
          const ids = await getIncidentNotificationTargetsForOrg(orgId, true);
          ids.forEach((id) => seen.add(id));
        }
        targetUserIds = Array.from(seen);
      } catch (e) {
        console.warn("[webhooks/sentry] test: org targeting failed, using fallback:", e);
      }
      if (targetUserIds.length === 0) {
        targetUserIds = await getIncidentNotificationTargets(true);
      }
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
              void sendIncidentAlertEmail(user.email, directTitle, directMessage, {
                service: "api",
                environment: appEnv,
                severity: "info",
              });
            }
          } catch (err) {
            console.warn("[webhooks/sentry] failed test notify:", err);
          }
        })
      );
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

    let apiRoute: string | undefined;
    let requestUrl: string | undefined;
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
    }

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
      api_route: apiRoute,
      request_url: requestUrl,
    };
    ingestIncidentEvent(event);

    const dedupeKey = getDedupeKey(issue as any, ev as any);
    const action = body?.action != null ? String(body.action) : undefined;
    if (shouldSkipDirectNotification(dedupeKey, action, !!ev)) {
      res.status(202).json({ accepted: true });
      return;
    }

    const targetUserIds = await (async (): Promise<string[]> => {
      const orgId = await storage.getOrganizationIdByIncidentServiceName(service);
      if (orgId) return getIncidentNotificationTargetsForOrg(orgId, false);
      return getIncidentNotificationTargets(false);
    })();
    const targetUsers = new Set<string>(targetUserIds);

    const directTitle = `Sentry: ${event.exception_type} in ${service}/${environment}`;
    const directMessage = ev
      ? `${event.message} (${severity})`
      : `${String(body?.action || "Alert")} from Sentry`;

    let culprit: string | undefined;
    if (ev) {
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

    const appStacktrace = stacktrace.filter(
      (f) => f.file && !String(f.file).includes("node_modules")
    );
    const resolveFrame = async (f: {
      file: string;
      function?: string;
      line?: number;
      colno?: number;
    }): Promise<{ file: string; function?: string; line?: number }> => {
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
    const resolvedStacktrace = await Promise.all(appStacktrace.map(resolveFrame));
    const directMeta = JSON.stringify({
      source: ev ? "sentry_event_alert" : "sentry_issue_alert",
      service,
      environment,
      severity,
      links: event.links || {},
      apiRoute: event.api_route,
      requestUrl: event.request_url,
      culprit,
      culpritSource,
      stacktrace: resolvedStacktrace,
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

    res.status(202).json({ accepted: true });
  } catch (error) {
    console.error("Sentry webhook error:", error);
    res.status(500).json({ error: "Failed to process Sentry webhook" });
  }
}
