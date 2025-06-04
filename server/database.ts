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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString);
const db = drizzle(client);

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserByGithubId(githubId: string): Promise<User | undefined> {
    // Since your schema doesn't have githubId, we'll use email or username for now
    // This would need to be adapted based on how you store GitHub user info
    return undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
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
    const result = await db.delete(integrations).where(eq(integrations.id, id));
    return result.rowCount > 0;
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
}

export const databaseStorage = new DatabaseStorage();