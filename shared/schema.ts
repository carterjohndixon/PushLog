import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username"),
  email: text("email"),
  verifiedEmail: boolean("verifiedEmail").default(false),
  isUsernameSet: boolean("isUsernameSet").default(false),
  verificationToken: text("verificationToken"),
  selected_github_repo: text("selected_github_repo"),
  slack_channel_id: text("slack_channel_id"),
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
  webhookId: text("webhook_id"),
  createdAt: timestamp("created_at").defaultNow(),
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
  createdAt: timestamp("created_at").defaultNow(),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const slackWorkspaces = pgTable("slack_workspaces", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  teamId: text("team_id").notNull(),
  teamName: text("team_name").notNull(),
  accessToken: text("access_token").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  verifiedEmail: true,
  isUsernameSet: true,
  verificationToken: true,
  selected_github_repo: true,
  slack_channel_id: true,
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

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Repository = typeof repositories.$inferSelect;
export type InsertRepository = z.infer<typeof insertRepositorySchema>;
export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type PushEvent = typeof pushEvents.$inferSelect;
export type InsertPushEvent = z.infer<typeof insertPushEventSchema>;
export type SlackWorkspace = typeof slackWorkspaces.$inferSelect;
export type InsertSlackWorkspace = z.infer<typeof insertSlackWorkspaceSchema>;
