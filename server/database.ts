import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { 
  users, repositories, integrations, pushEvents, slackWorkspaces,
  type User, type InsertUser,
  type Repository, type InsertRepository,
  type Integration, type InsertIntegration,
  type PushEvent, type InsertPushEvent,
  type SlackWorkspace, type InsertSlackWorkspace
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { IStorage } from "./storage";
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the project root (one level up from server directory)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
    createdAt: dbUser.createdAt
  };
}

interface OAuthSession {
  token: string;
  state: string;
  userId: number;
  expiresAt: Date;
}

export class DatabaseStorage implements IStorage {
  private users: Map<number, User>;
  private oauthSessions: Map<string, OAuthSession>;
  private nextId: number;

  constructor() {
    this.users = new Map();
    this.oauthSessions = new Map();
    this.nextId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] ? convertToUser(result[0]) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0] ? convertToUser(result[0]) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0] ? convertToUser(result[0]) : undefined;
  }

  async getUserByGithubId(githubId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
    return result[0] ? convertToUser(result[0]) : undefined;
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
    return result[0] ? convertToUser(result[0]) : undefined;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] ? convertToUser(result[0]) : undefined;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.verificationToken, token)).limit(1);
    return result[0] ? convertToUser(result[0]) : undefined;
  }

  async getUserByResetToken(resetToken: string): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.resetPasswordToken, resetToken)).limit(1);
    return result[0] ? convertToUser(result[0]) : null;
  }

  // Repository methods
  async getRepository(id: number): Promise<Repository | undefined> {
    const result = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
    return result[0];
  }

  async getRepositoriesByUserId(userId: number): Promise<Repository[]> {
    return await db.select().from(repositories).where(eq(repositories.userId, userId));
  }

  async getRepositoryByGithubId(githubId: string): Promise<Repository | undefined> {
    const result = await db.select().from(repositories).where(eq(repositories.githubId, githubId)).limit(1);
    return result[0];
  }

  async createRepository(repository: InsertRepository): Promise<Repository> {
    const result = await db.insert(repositories).values(repository).returning();
    return result[0];
  }

  async updateRepository(id: number, updates: Partial<Repository>): Promise<Repository | undefined> {
    const result = await db.update(repositories).set(updates).where(eq(repositories.id, id)).returning();
    return result[0];
  }

  async deleteRepository(id: number): Promise<boolean> {
    await db.delete(repositories).where(eq(repositories.id, id));
    return true;
  }

  // Integration methods
  async getIntegration(id: number): Promise<Integration | undefined> {
    const result = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
    return result[0];
  }

  async getIntegrationsByUserId(userId: number): Promise<Integration[]> {
    return await db.select().from(integrations).where(eq(integrations.userId, userId));
  }

  async getIntegrationByRepositoryId(repositoryId: number): Promise<Integration | undefined> {
    const result = await db.select().from(integrations).where(eq(integrations.repositoryId, repositoryId)).limit(1);
    return result[0];
  }

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const result = await db.insert(integrations).values(integration).returning();
    return result[0];
  }

  async updateIntegration(id: number, updates: Partial<Integration>): Promise<Integration | undefined> {
    const result = await db.update(integrations).set(updates).where(eq(integrations.id, id)).returning();
    return result[0];
  }

  async deleteIntegration(id: number): Promise<boolean> {
    const result = await db.delete(integrations).where(eq(integrations.id, id)) as any;
    return true;
  }

  // Push event methods
  async getPushEvent(id: number): Promise<PushEvent | undefined> {
    const result = await db.select().from(pushEvents).where(eq(pushEvents.id, id)).limit(1);
    return result[0];
  }

  async getPushEventsByRepositoryId(repositoryId: number): Promise<PushEvent[]> {
    return await db.select().from(pushEvents)
      .where(eq(pushEvents.repositoryId, repositoryId))
      .orderBy(pushEvents.pushedAt);
  }

  async createPushEvent(pushEvent: InsertPushEvent): Promise<PushEvent> {
    const result = await db.insert(pushEvents).values(pushEvent).returning();
    return result[0];
  }

  async updatePushEvent(id: number, updates: Partial<PushEvent>): Promise<PushEvent | undefined> {
    const result = await db.update(pushEvents).set(updates).where(eq(pushEvents.id, id)).returning();
    return result[0];
  }

  // Slack workspace methods
  async getSlackWorkspace(id: number): Promise<SlackWorkspace | undefined> {
    const result = await db.select().from(slackWorkspaces).where(eq(slackWorkspaces.id, id)).limit(1);
    return result[0];
  }

  async getSlackWorkspacesByUserId(userId: number): Promise<SlackWorkspace[]> {
    return await db.select().from(slackWorkspaces).where(eq(slackWorkspaces.userId, userId));
  }

  async getSlackWorkspaceByTeamId(teamId: string): Promise<SlackWorkspace | undefined> {
    const result = await db.select().from(slackWorkspaces).where(eq(slackWorkspaces.teamId, teamId)).limit(1);
    return result[0];
  }

  async createSlackWorkspace(workspace: InsertSlackWorkspace): Promise<SlackWorkspace> {
    const result = await db.insert(slackWorkspaces).values(workspace).returning();
    return result[0];
  }

  async updateSlackWorkspace(id: number, updates: Partial<SlackWorkspace>): Promise<SlackWorkspace | undefined> {
    const result = await db.update(slackWorkspaces).set(updates).where(eq(slackWorkspaces.id, id)).returning();
    return result[0];
  }

  // Analytics methods
  async getStatsForUser(userId: number): Promise<{
    activeIntegrations: number;
    totalRepositories: number;
    dailyPushes: number;
    totalNotifications: number;
  }> {
    const userIntegrations = await this.getIntegrationsByUserId(userId);
    const userRepositories = await this.getRepositoriesByUserId(userId);
    
    const activeIntegrations = userIntegrations.filter(integration => integration.isActive).length;
    const totalRepositories = userRepositories.length;
    
    // Calculate daily pushes (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const allPushEvents = await db.select().from(pushEvents);
    const dailyPushes = allPushEvents.filter(event => 
      userRepositories.some(repo => repo.id === event.repositoryId) &&
      event.pushedAt > oneDayAgo
    ).length;
    
    const totalNotifications = allPushEvents.filter(event => 
      userRepositories.some(repo => repo.id === event.repositoryId) &&
      event.notificationSent
    ).length;

    return {
      activeIntegrations,
      totalRepositories,
      dailyPushes,
      totalNotifications
    };
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
}

export const databaseStorage = new DatabaseStorage();