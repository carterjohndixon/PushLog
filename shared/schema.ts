import { pgTable, text, integer, boolean, timestamp, jsonb, uuid, customType, date, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql, type SQL } from "drizzle-orm";

// For full-text search generated column (push_events.search_vector)
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").unique(),
  email: text("email").unique(),
  password: text("password"),
  githubId: text("github_id").unique(),
  githubToken: text("github_token"),
  googleId: text("google_id").unique(),
  googleToken: text("google_token"),
  slackUserId: text("slack_user_id"),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: text("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordTokenExpiry: timestamp("reset_password_token_expiry"),
  // AI Credits and Settings
  aiCredits: integer("ai_credits").default(1000), // Free credits for new users
  stripeCustomerId: text("stripe_customer_id"),
  preferredAiModel: text("preferred_ai_model").default("gpt-5.2"),
  openRouterApiKey: text("open_router_api_key"), // Encrypted; when set, integrations can use OpenRouter with this key
  openaiApiKey: text("openai_api_key"), // Encrypted; when set, integrations use user's OpenAI key (user pays OpenAI)
  mfaEnabled: boolean("mfa_enabled").default(false),
  totpSecret: text("totp_secret"), // Encrypted TOTP secret for authenticator app
  monthlyBudget: integer("monthly_budget"), // Monthly AI spend budget in units of $0.0001; nullable = no budget
  overBudgetBehavior: text("over_budget_behavior").default("skip_ai"), // "skip_ai" = send plain push when over budget; "free_model" = use free model
  devMode: boolean("dev_mode").default(false), // Enable test features (e.g. Simulate incident on Integrations)
  incidentEmailEnabled: boolean("incident_email_enabled").default(true), // Email incident alerts (Sentry, spike, etc.)
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  githubId: text("github_id").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  owner: text("owner").notNull(),
  branch: text("branch").default("main"),
  isActive: boolean("is_active").default(true),
  monitorAllBranches: boolean("monitor_all_branches").default(false),
  webhookId: text("webhook_id"),
  /** Path prefixes/segments that matter for incident correlation (e.g. ["src/auth", "src/payments", "migrations"]). Boosts commits touching these. */
  criticalPaths: jsonb("critical_paths").$type<string[]>(),
  /** Optional Sentry/service name for mapping external incidents to this repo (e.g. "api"). */
  incidentServiceName: text("incident_service_name"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  repositoryId: uuid("repository_id").notNull(),
  slackWorkspaceId: uuid("slack_workspace_id"), // Links to slack_workspaces table
  slackChannelId: text("slack_channel_id").notNull(),
  slackChannelName: text("slack_channel_name").notNull(),
  notificationLevel: text("notification_level").default("all"), // all, main_only, tagged_only
  includeCommitSummaries: boolean("include_commit_summaries").default(true),
  isActive: boolean("is_active").default(true),
  // AI Settings
  aiModel: text("ai_model").default("gpt-5.2"),
  maxTokens: integer("max_tokens").default(350), // Maximum tokens for AI response
  openRouterApiKey: text("open_router_api_key"), // Encrypted; when set, summaries use OpenRouter with this key and aiModel as OpenRouter model id
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const pushEvents = pgTable("push_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: uuid("repository_id").notNull(),
  integrationId: uuid("integration_id").notNull(),
  commitSha: text("commit_sha").notNull(),
  commitMessage: text("commit_message").notNull(),
  author: text("author").notNull(),
  branch: text("branch").notNull(),
  pushedAt: timestamp("pushed_at").notNull(),
  notificationSent: boolean("notification_sent").default(false),
  additions: integer("additions").default(0),
  deletions: integer("deletions").default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  // AI Summary fields
  aiSummary: text("ai_summary"),
  aiImpact: text("ai_impact"),
  aiCategory: text("ai_category"),
  aiDetails: text("ai_details"),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  // Risk engine (Part 2.1)
  impactScore: integer("impact_score"),
  riskFlags: jsonb("risk_flags").$type<string[]>(),
  riskMetadata: jsonb("risk_metadata").$type<{ change_type_tags?: string[]; hotspot_files?: string[]; explanations?: string[] }>(),
  // Full-text search (Part 2.2) – generated column, kept in schema so db:push does not drop it
  searchVector: tsvector("search_vector").generatedAlwaysAs(
    (): SQL => sql`to_tsvector('english', coalesce(ai_summary, '') || ' ' || coalesce(commit_message, '') || ' ' || coalesce(author, '') || ' ' || coalesce(ai_impact, '') || ' ' || coalesce(ai_category, ''))`
  ),
});

export const pushEventFiles = pgTable("push_event_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  pushEventId: uuid("push_event_id").notNull(),
  filePath: text("file_path").notNull(),
  additions: integer("additions").notNull().default(0),
  deletions: integer("deletions").notNull().default(0),
});

export const slackWorkspaces = pgTable("slack_workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  teamId: text("team_id").notNull(),
  teamName: text("team_name").notNull(),
  accessToken: text("access_token").notNull(),
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true, mode: 'string' }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: text("type").notNull(), // 'push_event', 'slack_message_sent', 'email_verification'
  title: text("title"),
  message: text("message").notNull(),
  metadata: text("metadata"), // JSON string for additional data
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  integrationId: uuid("integration_id").notNull(),
  pushEventId: uuid("push_event_id").notNull(),
  model: text("model").notNull(), // gpt-5.2, gpt-5.1, gpt-4o, openrouter: e.g. moonshotai/kimi-k2.5
  tokensUsed: integer("tokens_used").notNull(),
  tokensPrompt: integer("tokens_prompt"), // Input/prompt tokens when available
  tokensCompletion: integer("tokens_completion"), // Output/completion tokens when available
  cost: integer("cost").notNull(), // Cost in units of $0.0001 (ten-thousandths of a dollar) for sub-cent precision
  openrouterGenerationId: text("openrouter_generation_id"), // OpenRouter gen-xxx for GET /api/v1/generation?id=...
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  // Per-generation cost tracking (DB pricing + snapshot)
  provider: text("provider"), // 'openai' | 'openrouter'
  modelId: text("model_id"), // same as model; denormalized for clarity
  totalTokens: integer("total_tokens"),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }),
  pricingId: uuid("pricing_id"), // fk -> ai_model_pricing.id
  pricingInputUsdPer1M: numeric("pricing_input_usd_per_1m", { precision: 12, scale: 6 }),
  pricingOutputUsdPer1M: numeric("pricing_output_usd_per_1m", { precision: 12, scale: 6 }),
  costStatus: text("cost_status").notNull().default("ok"), // 'ok' | 'missing_pricing' | 'no_usage'
});

/** Model pricing per provider (openai, openrouter). One active row per (provider, model_id). Use partial unique index WHERE active=true for history. */
export const aiModelPricing = pgTable("ai_model_pricing", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(), // 'openai' | 'openrouter'
  modelId: text("model_id").notNull(),
  inputUsdPer1M: numeric("input_usd_per_1m", { precision: 12, scale: 6 }).notNull(),
  outputUsdPer1M: numeric("output_usd_per_1m", { precision: 12, scale: 6 }).notNull(),
  active: boolean("active").notNull().default(true),
  effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const analyticsStats = pgTable("analytics_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  activeIntegrations: integer("active_integrations").notNull(),
  totalRepositories: integer("total_repositories").notNull(),
  dailyPushes: integer("daily_pushes").notNull(),
  totalNotifications: integer("total_notifications").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull(),
  amount: integer("amount").notNull(), // Amount in cents
  credits: integer("credits").notNull(), // Credits purchased
  status: text("status").notNull(), // succeeded, failed, pending
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const favoriteModels = pgTable("favorite_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  modelId: text("model_id").notNull(), // OpenRouter model id e.g. "anthropic/claude-opus-4.6"
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

/** Per-account login lockout (AUTH-VULN-11/12). Shared across instances. */
export const loginLockout = pgTable("login_lockout", {
  identifier: text("identifier").primaryKey(), // email or username, normalized lower
  failedCount: integer("failed_count").notNull().default(0),
  lockoutUntil: timestamp("lockout_until", { withTimezone: true, mode: "date" }), // null or past = not locked
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/** OAuth state for GitHub login/connect. Shared across instances (fixes multi-process callback lookup). */
export const oauthSessions = pgTable("oauth_sessions", {
  state: text("state").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/** OAuth identities: one row per (provider, provider_account_id). Prefer lookup by this over email. */
export const oauthIdentities = pgTable(
  "oauth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(), // "github" | "google"
    providerAccountId: text("provider_account_id").notNull(),
    userId: uuid("user_id").notNull(),
    email: text("email"),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    { name: "oauth_identities_provider_account_unique", unique: true, columns: [t.provider, t.providerAccountId] },
  ]
);

/** Session store used by connect-pg-simple (express-session). Declared so db:push does not drop it. */
export const userSessions = pgTable("user_sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true, mode: "date" }).notNull(),
});

/** Streaming stats engine aggregates (one row per user per day). */
export const userDailyStats = pgTable("user_daily_stats", {
    userId: uuid("user_id").notNull(),
    statDate: date("stat_date").notNull(),
    pushesCount: integer("pushes_count").notNull().default(0),
    totalRisk: integer("total_risk").notNull().default(0),
    perRepoCounts: jsonb("per_repo_counts").$type<Record<string, number>>().default({}),
  },
  (t) => [{ primaryKey: { columns: [t.userId, t.statDate], name: "user_daily_stats_pkey" } }]
);

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  githubId: true,
  githubToken: true,
  googleId: true,
  googleToken: true,
});

export const insertRepositorySchema = createInsertSchema(repositories).omit({
  id: true,
  createdAt: true,
});

export const insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  createdAt: true,
});

export const insertPushEventSchema = createInsertSchema(pushEvents).omit({
  id: true,
  createdAt: true,
});

export const insertPushEventFileSchema = createInsertSchema(pushEventFiles).omit({
  id: true,
});

export const insertSlackWorkspaceSchema = createInsertSchema(slackWorkspaces).omit({
  id: true,
  disconnectedAt: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertAiUsageSchema = createInsertSchema(aiUsage).omit({
  id: true,
  createdAt: true,
});

export const insertAiModelPricingSchema = createInsertSchema(aiModelPricing).omit({
  id: true,
});

export const insertAnalyticsStatsSchema = createInsertSchema(analyticsStats).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export const insertFavoriteModelSchema = createInsertSchema(favoriteModels).omit({
  id: true,
  createdAt: true,
});

export const insertUserDailyStatsSchema = createInsertSchema(userDailyStats);

export type OAuthIdentity = {
  id: string;
  provider: string;
  providerAccountId: string;
  userId: string;
  email: string | null;
  verified: boolean;
  createdAt: Date | string;
};

export type User = {
  id: string;
  username: string | null;
  email: string | null;
  password: string | null;
  githubId: string | null;
  githubToken: string | null;
  googleId: string | null;
  googleToken: string | null;
  slackUserId: string | null;
  emailVerified: boolean;
  verificationToken: string | null;
  verificationTokenExpiry: string | null;
  resetPasswordToken: string | null;
  resetPasswordTokenExpiry: string | null;
  aiCredits: number;
  stripeCustomerId: string | null;
  preferredAiModel: string;
  openRouterApiKey: string | null;
  openaiApiKey: string | null;
  mfaEnabled?: boolean;
  totpSecret: string | null;
  monthlyBudget: number | null;
  overBudgetBehavior: "free_model" | "skip_ai";
  devMode?: boolean;
  incidentEmailEnabled?: boolean;
  createdAt: string;
};

export type InsertUser = {
  username?: string | null;
  email?: string | null;
  password?: string | null;
  githubId?: string | null;
  githubToken?: string | null;
  googleId?: string | null;
  googleToken?: string | null;
  slackUserId?: string | null;
  emailVerified?: boolean;
  verificationToken?: string | null;
  verificationTokenExpiry?: string | null;
  resetPasswordToken?: string | null;
  resetPasswordTokenExpiry?: string | null;
};

export type Repository = typeof repositories.$inferSelect;
export type InsertRepository = z.infer<typeof insertRepositorySchema>;
export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type PushEvent = typeof pushEvents.$inferSelect;
export type InsertPushEvent = z.infer<typeof insertPushEventSchema>;
export type PushEventFile = typeof pushEventFiles.$inferSelect;
export type InsertPushEventFile = z.infer<typeof insertPushEventFileSchema>;
export type SlackWorkspace = typeof slackWorkspaces.$inferSelect;
export type InsertSlackWorkspace = z.infer<typeof insertSlackWorkspaceSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type AiUsage = typeof aiUsage.$inferSelect;
export type InsertAiUsage = z.infer<typeof insertAiUsageSchema>;
export type AiModelPricing = typeof aiModelPricing.$inferSelect;
export type InsertAiModelPricing = z.infer<typeof insertAiModelPricingSchema>;
export type AnalyticsStats = typeof analyticsStats.$inferSelect;
export type InsertAnalyticsStats = z.infer<typeof insertAnalyticsStatsSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type FavoriteModel = typeof favoriteModels.$inferSelect;
export type InsertFavoriteModel = z.infer<typeof insertFavoriteModelSchema>;
export type UserDailyStats = typeof userDailyStats.$inferSelect;
export type InsertUserDailyStats = z.infer<typeof insertUserDailyStatsSchema>;
