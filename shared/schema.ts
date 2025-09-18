import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
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
  preferredAiModel: text("preferred_ai_model").default("gpt-3.5-turbo"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const repositories = pgTable("repositories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  githubId: text("github_id").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  owner: text("owner").notNull(),
  branch: text("branch").default("main"),
  isActive: boolean("is_active").default(true),
  monitorAllBranches: boolean("monitor_all_branches").default(false),
  webhookId: text("webhook_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const integrations = pgTable("integrations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  repositoryId: integer("repository_id").notNull(),
  slackChannelId: text("slack_channel_id").notNull(),
  slackChannelName: text("slack_channel_name").notNull(),
  notificationLevel: text("notification_level").default("all"), // all, main_only, tagged_only
  includeCommitSummaries: boolean("include_commit_summaries").default(true),
  isActive: boolean("is_active").default(true),
  // AI Settings
  aiModel: text("ai_model").default("gpt-3.5-turbo"), // gpt-3.5-turbo, gpt-4, etc.
  maxTokens: integer("max_tokens").default(350), // Maximum tokens for AI response
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const pushEvents = pgTable("push_events", {
  id: serial("id").primaryKey(),
  repositoryId: integer("repository_id").notNull(),
  integrationId: integer("integration_id").notNull(),
  commitSha: text("commit_sha").notNull(),
  commitMessage: text("commit_message").notNull(),
  author: text("author").notNull(),
  branch: text("branch").notNull(),
  pushedAt: timestamp("pushed_at").notNull(),
  notificationSent: boolean("notification_sent").default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  // AI Summary fields
  aiSummary: text("ai_summary"),
  aiImpact: text("ai_impact"),
  aiCategory: text("ai_category"),
  aiDetails: text("ai_details"),
  aiGenerated: boolean("ai_generated").notNull().default(false),
});

export const slackWorkspaces = pgTable("slack_workspaces", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  teamId: text("team_id").notNull(),
  teamName: text("team_name").notNull(),
  accessToken: text("access_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'push_event', 'slack_message_sent', 'email_verification'
  title: text("title"),
  message: text("message").notNull(),
  metadata: text("metadata"), // JSON string for additional data
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const aiUsage = pgTable("ai_usage", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  integrationId: integer("integration_id").notNull(),
  pushEventId: integer("push_event_id").notNull(),
  model: text("model").notNull(), // gpt-3.5-turbo, gpt-4, etc.
  tokensUsed: integer("tokens_used").notNull(),
  cost: integer("cost").notNull(), // Cost in cents
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull(),
  amount: integer("amount").notNull(), // Amount in cents
  credits: integer("credits").notNull(), // Credits purchased
  status: text("status").notNull(), // succeeded, failed, pending
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

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

export const insertSlackWorkspaceSchema = createInsertSchema(slackWorkspaces).omit({
  id: true,
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

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export type User = {
  id: number;
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
export type SlackWorkspace = typeof slackWorkspaces.$inferSelect;
export type InsertSlackWorkspace = z.infer<typeof insertSlackWorkspaceSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type AiUsage = typeof aiUsage.$inferSelect;
export type InsertAiUsage = z.infer<typeof insertAiUsageSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
