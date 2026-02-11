import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { 
  users, repositories, integrations, pushEvents, pushEventFiles, slackWorkspaces, notifications, aiUsage, payments,
  favoriteModels, loginLockout,
  type User, type InsertUser,
  type Repository, type InsertRepository,
  type Integration, type InsertIntegration,
  type PushEvent, type InsertPushEvent,
  type PushEventFile, type InsertPushEventFile,
  type SlackWorkspace, type InsertSlackWorkspace,
  type Notification, type InsertNotification,
  type AiUsage, type InsertAiUsage,
  type Payment, type InsertPayment,
  type AnalyticsStats,
  type FavoriteModel,
  analyticsStats
} from "@shared/schema";
import { eq, and, sql, inArray, desc, max, gte } from "drizzle-orm";
import type { IStorage, SearchPushEventsOptions } from "./storage";
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from "dotenv";
import { encrypt, decrypt } from "./encryption";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load .env file from the project root (one level up from server directory)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

/** Map raw push_events row (snake_case) to PushEvent (camelCase) for search results. */
function mapRowToPushEvent(row: Record<string, unknown>): PushEvent {
  return {
    id: row.id as number,
    repositoryId: row.repository_id as number,
    integrationId: row.integration_id as number,
    commitSha: row.commit_sha as string,
    commitMessage: row.commit_message as string,
    author: row.author as string,
    branch: row.branch as string,
    pushedAt: row.pushed_at != null ? new Date(row.pushed_at as string) : (undefined as unknown as Date),
    notificationSent: row.notification_sent as boolean | null,
    additions: row.additions as number | null,
    deletions: row.deletions as number | null,
    createdAt: row.created_at != null ? String(row.created_at) : "",
    aiSummary: row.ai_summary as string | null,
    aiImpact: row.ai_impact as string | null,
    aiCategory: row.ai_category as string | null,
    aiDetails: row.ai_details as string | null,
    aiGenerated: (row.ai_generated as boolean) ?? false,
    impactScore: row.impact_score as number | null,
    riskFlags: row.risk_flags as string[] | null,
    riskMetadata: row.risk_metadata as { change_type_tags?: string[]; hotspot_files?: string[]; explanations?: string[] } | null,
  };
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString);
const db = drizzle(client);

// Helper function to convert Drizzle's inferred type to our User type
function convertToUser(dbUser: typeof users.$inferSelect): User {
  return {
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    password: dbUser.password,
    githubId: dbUser.githubId,
    githubToken: dbUser.githubToken,
    googleId: dbUser.googleId,
    googleToken: dbUser.googleToken,
    slackUserId: dbUser.slackUserId,
    emailVerified: dbUser.emailVerified ?? false,
    verificationToken: dbUser.verificationToken,
    verificationTokenExpiry: dbUser.verificationTokenExpiry?.toISOString() ?? null,
    resetPasswordToken: dbUser.resetPasswordToken,
    resetPasswordTokenExpiry: dbUser.resetPasswordTokenExpiry?.toISOString() ?? null,
    aiCredits: dbUser.aiCredits ?? 1000,
    stripeCustomerId: dbUser.stripeCustomerId,
    preferredAiModel: dbUser.preferredAiModel ?? "gpt-5.2",
    openRouterApiKey: (dbUser as any).openRouterApiKey ?? null,
    monthlyBudget: (dbUser as any).monthlyBudget ?? null,
    overBudgetBehavior: ((dbUser as any).overBudgetBehavior === "free_model" ? "free_model" : "skip_ai") as "free_model" | "skip_ai",
    createdAt: dbUser.createdAt
  };
}

function convertToAnalyticsStats(dbAnalyticsStats: typeof analyticsStats.$inferSelect): AnalyticsStats {
  return {
    id: dbAnalyticsStats.id as number,
    userId: dbAnalyticsStats.userId as number,
    activeIntegrations: dbAnalyticsStats.activeIntegrations as number,
    totalRepositories: dbAnalyticsStats.totalRepositories,
    dailyPushes: dbAnalyticsStats.dailyPushes as number,
    totalNotifications: dbAnalyticsStats.totalNotifications as number,
    createdAt: dbAnalyticsStats.createdAt as string
  } as AnalyticsStats;
}

interface OAuthSession {
  token: string;
  state: string;
  userId: number;
  expiresAt: Date;
}

export class DatabaseStorage implements IStorage {
  private users: Map<number, User>;
  private analyticsStats: Map<number, AnalyticsStats>;
  private oauthSessions: Map<string, OAuthSession>;

  constructor() {
    this.users = new Map<number, User>();
    this.analyticsStats = new Map<number, AnalyticsStats>();
    this.oauthSessions = new Map<string, OAuthSession>();
  }

  async init(): Promise<void> {
    // Initialize users
    const result = await db.select().from(users).orderBy(desc(users.id));
    for (const user of result) {
      this.users.set(user.id as number, convertToUser(user as any));
    }

    // Initialize analytics stats
    const analyticsStatsResult = await db.select().from(analyticsStats).orderBy(desc(analyticsStats.id));
    for (const analyticsStat of analyticsStatsResult) {
      this.analyticsStats.set(analyticsStat.id as number, convertToAnalyticsStats(analyticsStat as any));
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] ? convertToUser(result[0] as any) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0] ? convertToUser(result[0] as any) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0] ? convertToUser(result[0] as any) : undefined;
  }

  async getUserByGithubId(githubId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
    return result[0] ? convertToUser(result[0] as any) : undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values({
      ...user,
      verificationTokenExpiry: user.verificationTokenExpiry ? new Date(user.verificationTokenExpiry) : null,
      resetPasswordTokenExpiry: user.resetPasswordTokenExpiry ? new Date(user.resetPasswordTokenExpiry) : null,
    }).returning();
    return convertToUser(result[0]);
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const dbUpdates = {
      ...updates,
      verificationTokenExpiry: updates.verificationTokenExpiry ? new Date(updates.verificationTokenExpiry) : null,
      resetPasswordTokenExpiry: updates.resetPasswordTokenExpiry ? new Date(updates.resetPasswordTokenExpiry) : null,
    };
    const result = await db.update(users).set(dbUpdates).where(eq(users.id, id)).returning();
    return result[0] ? convertToUser(result[0] as any) : undefined;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const row = result[0];
    return row ? convertToUser(row as any) : undefined;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.verificationToken, token)).limit(1);
    return result[0] ? convertToUser(result[0] as any) : undefined;
  }

  async getUserByResetToken(resetToken: string): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.resetPasswordToken, resetToken)).limit(1);
    return result[0] ? convertToUser(result[0] as any) : null;
  }

  // Per-account login lockout (shared across instances; AUTH-VULN-11/12)
  private static readonly LOGIN_MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

  async getLoginLockout(identifier: string): Promise<{ locked: boolean; retryAfterSeconds: number }> {
    const key = identifier.trim().toLowerCase();
    const rows = await db.select().from(loginLockout).where(eq(loginLockout.identifier, key)).limit(1);
    const row = rows[0];
    const now = new Date();
    if (!row || !row.lockoutUntil) {
      return { locked: false, retryAfterSeconds: 0 };
    }
    if (row.lockoutUntil <= now) {
      await db.delete(loginLockout).where(eq(loginLockout.identifier, key));
      return { locked: false, retryAfterSeconds: 0 };
    }
    const retryAfterSeconds = Math.ceil((row.lockoutUntil.getTime() - now.getTime()) / 1000);
    return { locked: true, retryAfterSeconds };
  }

  async recordLoginFailedAttempt(identifier: string): Promise<void> {
    const key = identifier.trim().toLowerCase();
    const now = new Date();
    const lockoutUntil = new Date(now.getTime() + DatabaseStorage.LOGIN_LOCKOUT_WINDOW_MS);
    const rows = await db.select().from(loginLockout).where(eq(loginLockout.identifier, key)).limit(1);
    const row = rows[0];
    if (row?.lockoutUntil && row.lockoutUntil > now) return; // already locked, don't extend
    const newCount = row ? (row.failedCount ?? 0) + 1 : 1;
    const setLockoutUntil = newCount >= DatabaseStorage.LOGIN_MAX_FAILED_ATTEMPTS ? lockoutUntil : (row?.lockoutUntil ?? null);
    if (!row) {
      await db.insert(loginLockout).values({
        identifier: key,
        failedCount: newCount,
        lockoutUntil: setLockoutUntil,
        updatedAt: now,
      });
    } else {
      await db.update(loginLockout).set({
        failedCount: newCount,
        lockoutUntil: setLockoutUntil,
        updatedAt: now,
      }).where(eq(loginLockout.identifier, key));
    }
  }

  async clearLoginAttempts(identifier: string): Promise<void> {
    const key = identifier.trim().toLowerCase();
    await db.delete(loginLockout).where(eq(loginLockout.identifier, key));
  }

  // Repository methods
  async getRepository(id: number): Promise<Repository | undefined> {
    const result = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
    return result[0] as any;
  }

  async getRepositoriesByUserId(userId: number): Promise<Repository[]> {
    return await db.select().from(repositories).where(eq(repositories.userId, userId)) as any;
  }

  async getRepositoryByGithubId(githubId: string): Promise<Repository | undefined> {
    const result = await db.select().from(repositories).where(eq(repositories.githubId, githubId)).limit(1);
    return result[0] as any;
  }

  async createRepository(repository: InsertRepository): Promise<Repository> {
    const result = await db.insert(repositories).values(repository).returning();
    return result[0] as any;
  }

  async updateRepository(id: number, updates: Partial<Repository>): Promise<Repository | undefined> {
    const result = await db.update(repositories).set(updates).where(eq(repositories.id, id)).returning();
    return result[0] as any;
  }

  async deleteRepository(id: number): Promise<boolean> {
    await db.delete(repositories).where(eq(repositories.id, id));
    return true;
  }

  // Integration methods
  async getIntegration(id: number): Promise<Integration | undefined> {
    const result = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
    return result[0] as any;
  }

  async getIntegrationsByUserId(userId: number): Promise<Integration[]> {
    return await db.select().from(integrations).where(eq(integrations.userId, userId)) as any;
  }

  async getIntegrationsByRepositoryId(repositoryId: number): Promise<Integration[]> {
    return await db.select().from(integrations).where(eq(integrations.repositoryId, repositoryId)) as any;
  }

  async getIntegrationByRepositoryId(repositoryId: number): Promise<Integration | undefined> {
    const result = await db.select().from(integrations).where(eq(integrations.repositoryId, repositoryId)).limit(1);
    return result[0] as any;
  }

  async getIntegrationsBySlackChannel(workspaceId: number, channelId: string): Promise<Integration[]> {
    return await db.select().from(integrations).where(
      and(eq(integrations.slackWorkspaceId, workspaceId), eq(integrations.slackChannelId, channelId))
    ) as any;
  }

  /** Get all integrations for a Slack team + channel. Use for slash commands so we see integrations from any user who connected this team. */
  async getIntegrationsBySlackTeamAndChannel(teamId: string, channelId: string): Promise<Integration[]> {
    const workspaces = await db.select({ id: slackWorkspaces.id }).from(slackWorkspaces).where(eq(slackWorkspaces.teamId, teamId));
    const workspaceIds = workspaces.map((w) => w.id).filter((id): id is number => id != null);
    if (workspaceIds.length === 0) {
      console.log("[Slack] No workspace found for team_id=%s (channel_id=%s). Check that this Slack workspace is connected in PushLog.", teamId, channelId);
      return [];
    }
    const rows = await db.select().from(integrations).where(
      and(inArray(integrations.slackWorkspaceId, workspaceIds), eq(integrations.slackChannelId, channelId))
    ) as any;
    if (rows.length === 0) {
      const anyInChannel = await db.select({ id: integrations.id, slackChannelId: integrations.slackChannelId }).from(integrations).where(inArray(integrations.slackWorkspaceId, workspaceIds));
      console.log("[Slack] No integration for channel_id=%s. Workspace has %d integration(s) in other channels: %s", channelId, anyInChannel.length, anyInChannel.map((i: any) => i.slackChannelId).join(", "));
    }
    return rows;
  }

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const result = await db.insert(integrations).values(integration).returning();
    return result[0] as any;
  }

  async updateIntegration(id: number, updates: Partial<Integration>): Promise<Integration | undefined> {
    console.log(`💾 Database: Updating integration ${id} with:`, JSON.stringify(updates, null, 2));
    const result = await db.update(integrations).set(updates).where(eq(integrations.id, id)).returning();
    const updated = result[0] as any;
    if (updated) {
      console.log(`✅ Database: Integration ${id} updated. New ai_model: ${updated.aiModel}`);
    }
    return updated;
  }

  async deleteIntegration(id: number): Promise<boolean> {
    const result = await db.delete(integrations).where(eq(integrations.id, id)).returning();
    return result[0] !== undefined;
  }

  // Push event methods
  async getPushEvent(id: number): Promise<PushEvent | undefined> {
    const result = await db.select().from(pushEvents).where(eq(pushEvents.id, id)).limit(1);
    return result[0] as PushEvent | undefined;
  }

  async getPushEventsByRepositoryId(repositoryId: number, options?: { limit?: number; offset?: number }): Promise<PushEvent[]> {
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    const result = await db.select().from(pushEvents)
      .where(eq(pushEvents.repositoryId, repositoryId))
      .orderBy(desc(pushEvents.pushedAt))
      .limit(limit)
      .offset(offset);
    return result as PushEvent[];
  }

  /** Push events for all of a user's repos, one query (after resolving repo IDs), bounded (default limit 100). */
  async getPushEventsForUser(userId: number, options?: { limit?: number; offset?: number }): Promise<PushEvent[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const repoRows = await db.select({ id: repositories.id }).from(repositories).where(eq(repositories.userId, userId));
    const repoIds = repoRows.map((r) => r.id);
    if (repoIds.length === 0) return [];
    const result = await db.select().from(pushEvents)
      .where(inArray(pushEvents.repositoryId, repoIds))
      .orderBy(desc(pushEvents.pushedAt))
      .limit(limit)
      .offset(offset);
    return result as PushEvent[];
  }

  /** Total count of push events for a user (all repos), one query. */
  async getPushEventCountForUser(userId: number): Promise<number> {
    const [row] = await db.execute<{ c: number }>(sql`
      SELECT count(*)::int AS c
      FROM push_events e
      INNER JOIN repositories r ON e.repository_id = r.id
      WHERE r.user_id = ${userId}
    `);
    return row?.c ?? 0;
  }

  /** Full-text search over push events (Part 2.2). User-scoped; optional filters by repo, date, minImpact. */
  async searchPushEvents(userId: number, options: SearchPushEventsOptions): Promise<PushEvent[]> {
    const { q, repositoryId, from, to, minImpact, limit = 50, offset = 0 } = options;
    const query = (q ?? "").trim();
    if (!query) return [];
    const repoRows = await db.select({ id: repositories.id }).from(repositories).where(eq(repositories.userId, userId));
    const repoIds = repoRows.map((r) => r.id);
    if (repoIds.length === 0) return [];
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT e.id, e.repository_id, e.integration_id, e.commit_sha, e.commit_message, e.author, e.branch,
             e.pushed_at, e.notification_sent, e.additions, e.deletions, e.created_at,
             e.ai_summary, e.ai_impact, e.ai_category, e.ai_details, e.ai_generated,
             e.impact_score, e.risk_flags, e.risk_metadata
      FROM push_events e
      INNER JOIN repositories r ON e.repository_id = r.id
      WHERE r.user_id = ${userId}
        AND e.search_vector @@ plainto_tsquery('english', ${query})
        AND (${repositoryId ?? null}::int IS NULL OR e.repository_id = ${repositoryId ?? null})
        AND (${from ?? null}::timestamptz IS NULL OR e.pushed_at >= (${from ?? null}::timestamptz))
        AND (${to ?? null}::timestamptz IS NULL OR e.pushed_at <= (${to ?? null}::timestamptz))
        AND (${minImpact ?? null}::int IS NULL OR e.impact_score >= ${minImpact ?? null})
      ORDER BY e.pushed_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const list = Array.isArray(rows) ? rows : [rows];
    return list.map((row) => mapRowToPushEvent(row)) as PushEvent[];
  }

  /** Analytics: push counts by day for user's repos (one query, GROUP BY date). */
  async getAnalyticsPushesByDay(userId: number, startDate: Date): Promise<{ date: string; count: number }[]> {
    const startIso = startDate.toISOString().slice(0, 10);
    const rows = await db.execute<{ day: string; count: number }>(sql`
      SELECT (date_trunc('day', e.pushed_at)::date)::text AS day, count(*)::int AS count
      FROM push_events e
      INNER JOIN repositories r ON e.repository_id = r.id
      WHERE r.user_id = ${userId} AND e.pushed_at >= ${startIso}
      GROUP BY date_trunc('day', e.pushed_at)::date
    `);
    const list = Array.isArray(rows) ? rows : [rows];
    return list.map((r) => ({ date: (r?.day ?? "").slice(0, 10), count: r?.count ?? 0 }));
  }

  /** Analytics: top repos by churn (one query, GROUP BY repository_id with repo names). */
  async getAnalyticsTopRepos(userId: number, limit: number = 10): Promise<{ repositoryId: number; name: string; fullName: string; pushCount: number; totalAdditions: number; totalDeletions: number }[]> {
    const rows = await db.execute<{ repository_id: number; name: string; full_name: string; push_count: number; total_additions: number; total_deletions: number }>(sql`
      SELECT r.id AS repository_id, r.name, r.full_name,
             count(e.id)::int AS push_count,
             coalesce(sum(e.additions), 0)::int AS total_additions,
             coalesce(sum(e.deletions), 0)::int AS total_deletions
      FROM repositories r
      LEFT JOIN push_events e ON e.repository_id = r.id
      WHERE r.user_id = ${userId}
      GROUP BY r.id, r.name, r.full_name
      ORDER BY (coalesce(sum(e.additions), 0) + coalesce(sum(e.deletions), 0)) DESC
      LIMIT ${limit}
    `);
    const list = Array.isArray(rows) ? rows : [rows];
    return list.map((r) => ({
      repositoryId: r?.repository_id ?? 0,
      name: r?.name ?? "",
      fullName: r?.full_name ?? "",
      pushCount: r?.push_count ?? 0,
      totalAdditions: r?.total_additions ?? 0,
      totalDeletions: r?.total_deletions ?? 0,
    }));
  }

  /** Analytics: Slack notifications by day (one query, GROUP BY date). */
  async getAnalyticsSlackByDay(userId: number, startDate: Date): Promise<{ date: string; count: number }[]> {
    const startIso = startDate.toISOString().slice(0, 10);
    const rows = await db.execute<{ day: string; count: number }>(sql`
      SELECT (created_at::date)::text AS day, count(*)::int AS count
      FROM notifications
      WHERE user_id = ${userId} AND type = 'slack_message_sent' AND created_at >= ${startIso}
      GROUP BY created_at::date
    `);
    const list = Array.isArray(rows) ? rows : [rows];
    return list.map((r) => ({ date: (r?.day ?? "").slice(0, 10), count: r?.count ?? 0 }));
  }

  /** Analytics: AI usage counts by model (one query, GROUP BY model). */
  async getAnalyticsAiModelUsage(userId: number): Promise<{ model: string; count: number }[]> {
    const rows = await db.execute<{ model: string; count: number }>(sql`
      SELECT model, count(*)::int AS count
      FROM ai_usage
      WHERE user_id = ${userId}
      GROUP BY model
      ORDER BY count(*) DESC
    `);
    const list = Array.isArray(rows) ? rows : [rows];
    return list.map((r) => ({ model: r?.model ?? "unknown", count: r?.count ?? 0 }));
  }

  async createPushEvent(pushEvent: InsertPushEvent): Promise<PushEvent> {
    const result = await db.insert(pushEvents).values(pushEvent).returning();
    return result[0] as PushEvent;
  }

  async updatePushEvent(id: number, updates: Partial<PushEvent>): Promise<PushEvent | undefined> {
    const result = await db.update(pushEvents).set(updates).where(eq(pushEvents.id, id)).returning();
    return result[0] as PushEvent | undefined;
  }

  // Slack workspace methods
  async getSlackWorkspace(id: number): Promise<SlackWorkspace | undefined> {
    const result = await db.select().from(slackWorkspaces).where(eq(slackWorkspaces.id, id)).limit(1);
    if (!result[0]) return undefined;
    const ws = result[0] as any;
    // Decrypt access token
    return {
      ...ws,
      accessToken: decrypt(ws.accessToken)
    };
  }

  async getSlackWorkspacesByUserId(userId: number): Promise<SlackWorkspace[]> {
    const results = await db.select().from(slackWorkspaces).where(eq(slackWorkspaces.userId, userId));
    // Decrypt access tokens (but don't expose them in list responses)
    return results.map((ws: any) => ({
      ...ws,
      accessToken: decrypt(ws.accessToken)
    }));
  }

  async getSlackWorkspaceByTeamId(teamId: string): Promise<SlackWorkspace | undefined> {
    const result = await db.select().from(slackWorkspaces).where(eq(slackWorkspaces.teamId, teamId)).limit(1);
    if (!result[0]) return undefined;
    const ws = result[0] as any;
    return {
      ...ws,
      accessToken: decrypt(ws.accessToken)
    };
  }

  async createSlackWorkspace(workspace: InsertSlackWorkspace): Promise<SlackWorkspace> {
    // Encrypt the access token before storing
    const encryptedWorkspace = {
      ...workspace,
      accessToken: encrypt(workspace.accessToken)
    };
    const result = await db.insert(slackWorkspaces).values(encryptedWorkspace).returning();
    // Decrypt before returning
    const ws = result[0] as any;
    return {
      ...ws,
      accessToken: decrypt(ws.accessToken)
    };
  }

  async updateSlackWorkspace(id: number, updates: Partial<SlackWorkspace>): Promise<SlackWorkspace | undefined> {
    // Encrypt access token if being updated
    const encryptedUpdates = updates.accessToken 
      ? { ...updates, accessToken: encrypt(updates.accessToken) }
      : updates;
    const result = await db.update(slackWorkspaces).set(encryptedUpdates).where(eq(slackWorkspaces.id, id)).returning();
    if (!result[0]) return undefined;
    // Decrypt before returning
    const ws = result[0] as any;
    return {
      ...ws,
      accessToken: decrypt(ws.accessToken)
    };
  }

  async getSlackWorkspaceDecrypted(id: number): Promise<SlackWorkspace | undefined> {
    const result = await db.select().from(slackWorkspaces).where(eq(slackWorkspaces.id, id)).limit(1);
    if (!result[0]) return undefined;
    const ws = result[0] as any;
    return {
      ...ws,
      accessToken: decrypt(ws.accessToken)
    };
  }

  // Analytics methods
  async getStatsForUser(userId: number): Promise<AnalyticsStats> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Single round-trip: all 5 stats via scalar subqueries (no full table loads, minimal latency)
    const [row] = await db.execute<{
      active_integrations: number;
      total_repositories: number;
      daily_pushes: number;
      push_event_notifications: number;
      slack_messages_sent: number;
    }>(sql`
      SELECT
        (SELECT count(*)::int FROM integrations i WHERE i.user_id = ${userId} AND i.is_active = true) AS active_integrations,
        (SELECT count(*)::int FROM repositories r WHERE r.user_id = ${userId}) AS total_repositories,
        (SELECT count(*)::int FROM push_events e INNER JOIN repositories r ON e.repository_id = r.id WHERE r.user_id = ${userId} AND e.pushed_at >= ${oneDayAgo}) AS daily_pushes,
        (SELECT count(*)::int FROM push_events e INNER JOIN repositories r ON e.repository_id = r.id WHERE r.user_id = ${userId} AND e.notification_sent = true) AS push_event_notifications,
        (SELECT count(*)::int FROM notifications n WHERE n.user_id = ${userId} AND n.type = 'slack_message_sent') AS slack_messages_sent
    `);
    const activeIntegrations = row?.active_integrations ?? 0;
    const totalRepositories = row?.total_repositories ?? 0;
    const dailyPushes = row?.daily_pushes ?? 0;
    const pushEventNotifications = row?.push_event_notifications ?? 0;
    const slackMessagesSent = row?.slack_messages_sent ?? 0;
    const totalNotifications = slackMessagesSent + pushEventNotifications;

    // Persist snapshot to the database
    const [inserted] = await db.insert(analyticsStats).values({
      userId,
      activeIntegrations,
      totalRepositories,
      dailyPushes,
      totalNotifications,
    }).returning();
    const result = inserted as unknown as AnalyticsStats;
    this.analyticsStats.set(result.id, result);
    return result;
  }

  /** Get the last N analytics_stats snapshots for a user (most recent first). */
  async getAnalyticsStatsHistory(userId: number, limit: number = 30): Promise<AnalyticsStats[]> {
    const rows = await db
      .select()
      .from(analyticsStats)
      .where(eq(analyticsStats.userId, userId))
      .orderBy(desc(analyticsStats.createdAt))
      .limit(limit);
    return rows as AnalyticsStats[];
  }

  async storeOAuthSession(session: OAuthSession): Promise<void> {
    this.oauthSessions.set(session.state, session);
  }

  async getOAuthSession(state: string): Promise<OAuthSession | null> {
    const session = this.oauthSessions.get(state);
    if (!session) return null;

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      this.oauthSessions.delete(state);
      return null;
    }

    return session;
  }

  async deleteOAuthSession(state: string): Promise<void> {
    this.oauthSessions.delete(state);
  }

  // Notification methods
  async getNotificationsByUserId(userId: number, options?: { limit?: number; offset?: number }): Promise<Notification[]> {
    const limit = options?.limit;
    const offset = options?.offset ?? 0;
    if (limit != null) {
      return await db.select().from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset) as any;
    }
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt)) as any;
  }

  /** Single-query count for dashboard/summary (no load of all rows). */
  async getNotificationCountForUser(userId: number): Promise<number> {
    const [row] = await db.execute<{ c: number }>(sql`
      SELECT count(*)::int AS c FROM notifications WHERE user_id = ${userId}
    `);
    return row?.c ?? 0;
  }

  /** Get one notification by id and userId (for mark-read/delete without loading all). */
  async getNotificationByIdAndUserId(id: number, userId: number): Promise<Notification | undefined> {
    const result = await db.select().from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .limit(1);
    return result[0] as Notification | undefined;
  }

  /** Check if user has any notification of given type (e.g. for email_verification inject). */
  async hasNotificationOfType(userId: number, type: string): Promise<boolean> {
    const result = await db.select().from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, type)))
      .limit(1);
    return result.length > 0;
  }

  async getUnreadNotificationsByUserId(userId: number): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .orderBy(notifications.createdAt) as any;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values(notification).returning();
    return result[0] as any;
  }

  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    try {
      console.log(`📝 Database: Marking notification ${id} as read`);
      const result = await db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, id))
        .returning();
      
      if (result.length === 0) {
        console.error(`❌ Database: No notification found with id ${id}`);
        return undefined;
      }
      
      console.log(`✅ Database: Notification ${id} updated. isRead: ${result[0].isRead}`);
      return result[0] as any;
    } catch (error) {
      console.error(`❌ Database: Error marking notification ${id} as read:`, error);
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId: number): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: number): Promise<boolean> {
    await db.delete(notifications).where(eq(notifications.id, id));
    return true;
  }

  async deleteAllNotifications(userId: number): Promise<boolean> {
    console.log(`🗄️ [DATABASE] Deleting all notifications for user ${userId}`);
    
    // Get count before deletion
    const beforeCount = await db.select().from(notifications).where(eq(notifications.userId, userId));
    console.log(`📊 [DATABASE] Notifications before deletion:`, beforeCount.length);
    
    // Perform deletion
    const result = await db.delete(notifications).where(eq(notifications.userId, userId));
    console.log(`✅ [DATABASE] Delete operation result:`, result);
    
    // Verify deletion
    const afterCount = await db.select().from(notifications).where(eq(notifications.userId, userId));
    console.log(`🔍 [DATABASE] Notifications after deletion:`, afterCount.length);
    
    return true;
  }

  /** AI usage rows for user, bounded by default (last 1000) to avoid full-table scans. For export use a higher limit. */
  async getAiUsageByUserId(userId: number, options?: { limit?: number }): Promise<AiUsage[]> {
    const limit = options?.limit ?? 1000;
    return await db.select().from(aiUsage)
      .where(eq(aiUsage.userId, userId))
      .orderBy(desc(aiUsage.createdAt))
      .limit(limit) as any;
  }

  /** Sum of AI cost for user since monthStart (for webhook budget check). Single query, no full table load. */
  async getMonthlyAiSpend(userId: number, monthStart: Date): Promise<number> {
    const monthStartIso = monthStart.toISOString().slice(0, 10);
    const [row] = await db.execute<{ spend: number }>(sql`
      SELECT COALESCE(SUM(cost), 0)::bigint AS spend FROM ai_usage WHERE user_id = ${userId} AND created_at >= ${monthStartIso}
    `);
    return Number(row?.spend ?? 0);
  }

  /** Monthly summary: total spend and call count since monthStart (for /api/openrouter/monthly-spend). */
  async getMonthlyAiSummary(userId: number, monthStart: Date): Promise<{ totalSpend: number; callCount: number }> {
    const monthStartIso = monthStart.toISOString().slice(0, 10);
    const [row] = await db.execute<{ total_spend: string; call_count: number }>(sql`
      SELECT COALESCE(SUM(cost), 0)::bigint AS total_spend, COUNT(*)::int AS call_count
      FROM ai_usage WHERE user_id = ${userId} AND created_at >= ${monthStartIso}
    `);
    return { totalSpend: Number(row?.total_spend ?? 0), callCount: row?.call_count ?? 0 };
  }

  /** Total AI usage row count for user (for dashboard data summary). Single COUNT query. */
  async getAiUsageCountForUser(userId: number): Promise<number> {
    const [row] = await db.execute<{ c: number }>(sql`
      SELECT count(*)::int AS c FROM ai_usage WHERE user_id = ${userId}
    `);
    return row?.c ?? 0;
  }

  /** Daily AI usage aggregation (date, totalCost, callCount) for charts. One GROUP BY query. */
  async getAiUsageDailyByUserId(userId: number, startDate: Date): Promise<{ date: string; totalCost: number; callCount: number }[]> {
    const startIso = startDate.toISOString().slice(0, 10);
    const rows = await db.execute<{ day: string; total_cost: string; call_count: number }>(sql`
      SELECT (date_trunc('day', created_at)::date)::text AS day,
             COALESCE(SUM(cost), 0)::bigint AS total_cost,
             count(*)::int AS call_count
      FROM ai_usage
      WHERE user_id = ${userId} AND created_at >= ${startIso}
      GROUP BY date_trunc('day', created_at)::date
      ORDER BY day
    `);
    const list = Array.isArray(rows) ? rows : [rows];
    return list.map((r) => ({
      date: r.day,
      totalCost: Number(r.total_cost ?? 0),
      callCount: r.call_count ?? 0,
    }));
  }

  /** Cost by model (model, cost, calls, tokens) for analytics. One GROUP BY query. */
  async getAiUsageByModelForAnalytics(userId: number, startDate?: Date): Promise<{ model: string; cost: number; calls: number; tokens: number }[]> {
    if (startDate) {
      const startIso = startDate.toISOString().slice(0, 10);
      const rows = await db.execute<{ model: string; cost: string; calls: number; tokens: string }>(sql`
        SELECT model, COALESCE(SUM(cost), 0)::bigint AS cost, count(*)::int AS calls, COALESCE(SUM(tokens_used), 0)::bigint AS tokens
        FROM ai_usage WHERE user_id = ${userId} AND created_at >= ${startIso}
        GROUP BY model ORDER BY cost DESC
      `);
      const list = Array.isArray(rows) ? rows : [rows];
      return list.map((r) => ({
        model: r.model ?? "unknown",
        cost: Number(r.cost ?? 0),
        calls: r.calls ?? 0,
        tokens: Number(r.tokens ?? 0),
      }));
    }
    const rows = await db.execute<{ model: string; cost: string; calls: number; tokens: string }>(sql`
      SELECT model, COALESCE(SUM(cost), 0)::bigint AS cost, count(*)::int AS calls, COALESCE(SUM(tokens_used), 0)::bigint AS tokens
      FROM ai_usage WHERE user_id = ${userId}
      GROUP BY model ORDER BY cost DESC
    `);
    const list = Array.isArray(rows) ? rows : [rows];
    return list.map((r) => ({
      model: r.model ?? "unknown",
      cost: Number(r.cost ?? 0),
      calls: r.calls ?? 0,
      tokens: Number(r.tokens ?? 0),
    }));
  }

  /** Get the single AI usage row for a push event (one usage record per push when AI summary is generated). */
  async getAiUsageByPushEventId(pushEventId: number, userId: number): Promise<AiUsage | undefined> {
    const rows = await db
      .select()
      .from(aiUsage)
      .where(and(eq(aiUsage.pushEventId, pushEventId), eq(aiUsage.userId, userId)))
      .limit(1);
    return rows[0] as AiUsage | undefined;
  }

  async createAiUsage(usage: InsertAiUsage): Promise<AiUsage> {
    const [result] = await db.insert(aiUsage).values(usage).returning();
    return result as any;
  }

  async updateAiUsage(pushEventId: number, userId: number, updates: Partial<AiUsage>): Promise<AiUsage | undefined> {
    const allowed = ['model', 'tokensUsed', 'cost', 'openrouterGenerationId'] as const;
    const set: Record<string, unknown> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) set[key] = updates[key];
    }
    if (Object.keys(set).length === 0) {
      const [existing] = await db.select().from(aiUsage).where(and(eq(aiUsage.pushEventId, pushEventId), eq(aiUsage.userId, userId))).limit(1);
      return existing as AiUsage | undefined;
    }
    const [result] = await db.update(aiUsage).set(set).where(and(eq(aiUsage.pushEventId, pushEventId), eq(aiUsage.userId, userId))).returning();
    return result as AiUsage | undefined;
  }

  async deleteAiUsage(pushEventId: number, userId: number): Promise<boolean> {
    const deleted = await db.delete(aiUsage).where(and(eq(aiUsage.pushEventId, pushEventId), eq(aiUsage.userId, userId))).returning({ id: aiUsage.id });
    return deleted.length > 0;
  }

  /** AI usage rows with push_events.pushed_at as fallback when created_at is null (for "Last used" display). Bounded by default (limit 500). */
  async getAiUsageWithPushDateByUserId(userId: number, options?: { limit?: number; offset?: number }): Promise<(AiUsage & { pushedAt: string | null })[]> {
    const limit = options?.limit ?? 500;
    const offset = options?.offset ?? 0;
    const rows = await db
      .select({
        id: aiUsage.id,
        userId: aiUsage.userId,
        integrationId: aiUsage.integrationId,
        pushEventId: aiUsage.pushEventId,
        model: aiUsage.model,
        tokensUsed: aiUsage.tokensUsed,
        cost: aiUsage.cost,
        openrouterGenerationId: aiUsage.openrouterGenerationId,
        createdAt: aiUsage.createdAt,
        pushedAt: pushEvents.pushedAt,
      })
      .from(aiUsage)
      .leftJoin(pushEvents, eq(aiUsage.pushEventId, pushEvents.id))
      .where(eq(aiUsage.userId, userId))
      .orderBy(desc(aiUsage.createdAt))
      .limit(limit)
      .offset(offset);
    return rows as (AiUsage & { pushedAt: string | null })[];
  }

  /** Last-used timestamp per model (max created_at) for the user. Used for "Last used" on /models in user's timezone. */
  async getLastUsedByModelByUserId(userId: number): Promise<{ model: string; lastUsedAt: string }[]> {
    const rows = await db
      .select({
        model: aiUsage.model,
        lastUsedAt: sql<string>`MAX(${aiUsage.createdAt})`.as("last_used_at"),
      })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId))
      .groupBy(aiUsage.model);
    return rows.map((r) => ({
      model: r.model,
      lastUsedAt: r.lastUsedAt != null ? String(r.lastUsedAt) : "",
    }));
  }

  // Push event file methods (for analytics: lines changed per file)
  async createPushEventFile(file: InsertPushEventFile): Promise<PushEventFile> {
    const [result] = await db.insert(pushEventFiles).values(file).returning();
    return result as any;
  }

  async getFileStatsByRepositoryId(repositoryId: number): Promise<{ filePath: string; additions: number; deletions: number }[]> {
    const rows = await db
      .select({
        filePath: pushEventFiles.filePath,
        additions: sql<number>`COALESCE(SUM(${pushEventFiles.additions}), 0)::int`,
        deletions: sql<number>`COALESCE(SUM(${pushEventFiles.deletions}), 0)::int`,
      })
      .from(pushEventFiles)
      .innerJoin(pushEvents, eq(pushEventFiles.pushEventId, pushEvents.id))
      .where(eq(pushEvents.repositoryId, repositoryId))
      .groupBy(pushEventFiles.filePath);
    return rows as any;
  }

  // Payment methods
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [result] = await db.insert(payments).values(payment).returning();
    return result as any;
  }

  async getPaymentsByUserId(userId: number): Promise<Payment[]> {
    return await db.select().from(payments).where(eq(payments.userId, userId)) as any;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | null> {
    const [result] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
    return result ? convertToUser(result as any) : null;
  }

  // Favorite models methods
  async getFavoriteModelsByUserId(userId: number): Promise<FavoriteModel[]> {
    return await db.select().from(favoriteModels).where(eq(favoriteModels.userId, userId)).orderBy(desc(favoriteModels.createdAt)) as any;
  }

  async addFavoriteModel(userId: number, modelId: string): Promise<FavoriteModel> {
    const [result] = await db.insert(favoriteModels).values({ userId, modelId }).returning();
    return result as any;
  }

  async removeFavoriteModel(userId: number, modelId: string): Promise<boolean> {
    const deleted = await db.delete(favoriteModels)
      .where(and(eq(favoriteModels.userId, userId), eq(favoriteModels.modelId, modelId)))
      .returning({ id: favoriteModels.id });
    return deleted.length > 0;
  }

  async getDatabaseHealth(): Promise<string> {
    try {
      // Simple query to test database connection
      await db.execute(sql`SELECT 1`);
      return "healthy";
    } catch (error) {
      console.error("Database health check failed:", error);
      return "unhealthy";
    }
  }

  /**
   * Delete a session row from user_sessions (connect-pg-simple table).
   * Used on logout to guarantee server-side invalidation even if the session
   * store's destroy() fails or is not invoked. Ensures AUTH-VULN-03 remediation.
   */
  async deleteUserSession(sid: string): Promise<void> {
    await db.execute(sql`DELETE FROM user_sessions WHERE sid = ${sid}`);
  }

  /**
   * Delete all sessions for a user (sess JSON contains userId).
   * Used on password reset (AUTH-VULN-02) so stolen sessions are invalidated.
   */
  async deleteSessionsForUser(userId: number): Promise<void> {
    await db.execute(sql`DELETE FROM user_sessions WHERE (sess->>'userId')::int = ${userId}`);
  }

  /**
   * Delete all sessions for a user except the given sid (e.g. current session).
   * Used on change-password so other devices are logged out but user stays logged in.
   */
  async deleteSessionsForUserExcept(userId: number, exceptSid: string): Promise<void> {
    await db.execute(sql`DELETE FROM user_sessions WHERE (sess->>'userId')::int = ${userId} AND sid != ${exceptSid}`);
  }

  /**
   * Delete a user account and all associated data (GDPR compliance)
   */
  async deleteUserAccount(userId: number): Promise<{ success: boolean; deletedData: any }> {
    const deletedData: any = {
      userId,
      deletedAt: new Date().toISOString(),
      aiUsage: 0,
      payments: 0,
      notifications: 0,
      pushEvents: 0,
      integrations: 0,
      repositories: 0,
      slackWorkspaces: 0,
      user: false
    };

    try {
      // 1. Delete AI usage records (bulk delete, no full-table load)
      const deletedUsage = await db.delete(aiUsage).where(eq(aiUsage.userId, userId)).returning({ id: aiUsage.id });
      deletedData.aiUsage = deletedUsage.length;

      // 2. Delete payments (keep for legal/accounting - just anonymize)
      // We don't delete payments for legal reasons, but we'll count them
      const userPayments = await this.getPaymentsByUserId(userId);
      deletedData.payments = userPayments.length;

      // 3. Delete notifications
      await this.deleteAllNotifications(userId);
      deletedData.notifications = (await this.getNotificationCountForUser(userId)) === 0 ? deletedData.notifications : 0;

      // 4. Get all user repositories
      const userRepos = await this.getRepositoriesByUserId(userId);

      // 5. Delete push events for each repository
      for (const repo of userRepos) {
        const repoPushEvents = await db.select().from(pushEvents).where(eq(pushEvents.repositoryId, repo.id));
        for (const event of repoPushEvents) {
          await db.delete(pushEvents).where(eq(pushEvents.id, event.id));
          deletedData.pushEvents++;
        }
      }

      // 6. Delete integrations
      const userIntegrations = await this.getIntegrationsByUserId(userId);
      for (const integration of userIntegrations) {
        await db.delete(integrations).where(eq(integrations.id, integration.id));
        deletedData.integrations++;
      }

      // 7. Delete repositories
      for (const repo of userRepos) {
        await db.delete(repositories).where(eq(repositories.id, repo.id));
        deletedData.repositories++;
      }

      // 8. Delete Slack workspaces
      const userWorkspaces = await this.getSlackWorkspacesByUserId(userId);
      for (const workspace of userWorkspaces) {
        await db.delete(slackWorkspaces).where(eq(slackWorkspaces.id, workspace.id));
        deletedData.slackWorkspaces++;
      }

      // 9. Finally, delete the user
      await db.delete(users).where(eq(users.id, userId));
      deletedData.user = true;

      return { success: true, deletedData };
    } catch (error) {
      console.error("Error deleting user account:", error);
      return { success: false, deletedData };
    }
  }

  /**
   * Export all user data (GDPR compliance)
   */
  async exportUserData(userId: number): Promise<any> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const userRepos = await this.getRepositoriesByUserId(userId);
    const userIntegrations = await this.getIntegrationsByUserId(userId);
    const userWorkspaces = await this.getSlackWorkspacesByUserId(userId);
    const userNotifications = await this.getNotificationsByUserId(userId);
    const userAiUsage = await this.getAiUsageByUserId(userId, { limit: 50000 });
    const userPayments = await this.getPaymentsByUserId(userId);

    // Get push events for user's repositories
    const allPushEvents: any[] = [];
    for (const repo of userRepos) {
      const repoPushEvents = await db.select().from(pushEvents).where(eq(pushEvents.repositoryId, repo.id));
      allPushEvents.push(...repoPushEvents);
    }

    return {
      exportDate: new Date().toISOString(),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        aiCredits: user.aiCredits,
        preferredAiModel: user.preferredAiModel,
        // Exclude sensitive data like passwords, tokens
        githubConnected: !!user.githubId,
        googleConnected: !!user.googleId,
        slackConnected: !!user.slackUserId,
        stripeCustomerId: user.stripeCustomerId ? "***" : null
      },
      repositories: userRepos.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.fullName,
        owner: repo.owner,
        branch: repo.branch,
        isActive: repo.isActive,
        monitorAllBranches: repo.monitorAllBranches,
        createdAt: repo.createdAt
        // Exclude webhookId
      })),
      integrations: userIntegrations.map(integration => ({
        id: integration.id,
        repositoryId: integration.repositoryId,
        slackChannelName: integration.slackChannelName,
        notificationLevel: integration.notificationLevel,
        includeCommitSummaries: integration.includeCommitSummaries,
        isActive: integration.isActive,
        aiModel: integration.aiModel,
        maxTokens: integration.maxTokens,
        createdAt: integration.createdAt
        // Exclude slackChannelId, slackWorkspaceId
      })),
      slackWorkspaces: userWorkspaces.map(workspace => ({
        id: workspace.id,
        teamName: workspace.teamName,
        createdAt: workspace.createdAt
        // Exclude accessToken, teamId
      })),
      pushEvents: allPushEvents.map(event => ({
        id: event.id,
        repositoryId: event.repositoryId,
        commitSha: event.commitSha,
        commitMessage: event.commitMessage,
        author: event.author,
        branch: event.branch,
        pushedAt: event.pushedAt,
        notificationSent: event.notificationSent,
        aiSummary: event.aiSummary,
        aiImpact: event.aiImpact,
        aiCategory: event.aiCategory,
        createdAt: event.createdAt
      })),
      notifications: userNotifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        isRead: notification.isRead,
        createdAt: notification.createdAt
      })),
      aiUsage: userAiUsage.map(usage => ({
        id: usage.id,
        integrationId: usage.integrationId,
        model: usage.model,
        tokensUsed: usage.tokensUsed,
        cost: usage.cost,
        createdAt: usage.createdAt
      })),
      payments: userPayments.map(payment => ({
        id: payment.id,
        amount: payment.amount,
        credits: payment.credits,
        status: payment.status,
        createdAt: payment.createdAt
      }))
    };
  }
}

export const databaseStorage = new DatabaseStorage();