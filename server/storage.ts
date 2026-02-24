import { 
  users, repositories, integrations, pushEvents, slackWorkspaces, notifications,
  type User, type InsertUser,
  type Repository, type InsertRepository,
  type Integration, type InsertIntegration,
  type PushEvent, type InsertPushEvent,
  type SlackWorkspace, type InsertSlackWorkspace,
  type Notification, type InsertNotification,
  type AiUsage, type InsertAiUsage,
  AnalyticsStats,
} from "@shared/schema";
import { DatabaseStorage } from './database';

/** Options for full-text search over push events (Part 2.2). */
export interface SearchPushEventsOptions {
  q: string;
  repositoryId?: string;
  from?: string;   // ISO date string
  to?: string;     // ISO date string
  minImpact?: number;
  limit?: number;
  offset?: number;
}

/** Optional filters for listing push events (no full-text search). */
export interface ListPushEventsFilters {
  repositoryId?: string;
  from?: string;   // ISO date string (YYYY-MM-DD)
  to?: string;     // ISO date string (YYYY-MM-DD)
  minImpact?: number;
}

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGithubId(githubId: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  getAllUserIds(): Promise<string[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // Repository methods
  getRepository(id: string): Promise<Repository | undefined>;
  getRepositoriesByUserId(userId: string): Promise<Repository[]>;
  getRepositoryByGithubId(githubId: string): Promise<Repository | undefined>;
  createRepository(repository: InsertRepository): Promise<Repository>;
  updateRepository(id: string, updates: Partial<Repository>): Promise<Repository | undefined>;
  deleteRepository(id: string): Promise<boolean>;

  // Integration methods
  getIntegration(id: string): Promise<Integration | undefined>;
  getIntegrationsByUserId(userId: string): Promise<Integration[]>;
  getIntegrationsByRepositoryId(repositoryId: string): Promise<Integration[]>;
  getIntegrationByRepositoryId(repositoryId: string): Promise<Integration | undefined>;
  getIntegrationsBySlackChannel(workspaceId: string, channelId: string): Promise<Integration[]>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: string, updates: Partial<Integration>): Promise<Integration | undefined>;
  deleteIntegration(id: string): Promise<boolean>;

  // Push event methods
  getPushEvent(id: string): Promise<PushEvent | undefined>;
  getPushEventsByRepositoryId(repositoryId: string, options?: { limit?: number; offset?: number }): Promise<PushEvent[]>;
  getPushEventsForUser(userId: string, options?: { limit?: number; offset?: number } & ListPushEventsFilters): Promise<PushEvent[]>;
  getPushEventCountForUser(userId: string, filters?: ListPushEventsFilters): Promise<number>;
  /** Full-text search over push events (summary, message, author, impact, category). User-scoped to their repos. */
  searchPushEvents(userId: string, options: SearchPushEventsOptions): Promise<PushEvent[]>;
  createPushEvent(pushEvent: InsertPushEvent): Promise<PushEvent>;
  updatePushEvent(id: string, updates: Partial<PushEvent>): Promise<PushEvent | undefined>;

  // Slack workspace methods
  getSlackWorkspace(id: string): Promise<SlackWorkspace | undefined>;
  getSlackWorkspacesByUserId(userId: string): Promise<SlackWorkspace[]>;
  getSlackWorkspaceByTeamId(teamId: string): Promise<SlackWorkspace | undefined>;
  createSlackWorkspace(workspace: InsertSlackWorkspace): Promise<SlackWorkspace>;
  updateSlackWorkspace(id: string, updates: Partial<SlackWorkspace>): Promise<SlackWorkspace | undefined>;
  deleteSlackWorkspace(workspaceId: string, userId: string): Promise<boolean>;

  // OpenRouter methods
  getAiUsageByUserId(userId: string, options?: { limit?: number }): Promise<AiUsage[]>;
  getMonthlyAiSpend(userId: string, monthStart: Date): Promise<number>;
  getMonthlyAiSummary(userId: string, monthStart: Date): Promise<{ totalSpend: number; callCount: number }>;
  getAiUsageCountForUser(userId: string): Promise<number>;
  getAiUsageDailyByUserId(userId: string, startDate: Date): Promise<{ date: string; totalCost: number; callCount: number }[]>;
  getAiUsageByModelForAnalytics(userId: string, startDate?: Date): Promise<{ model: string; cost: number; calls: number; tokens: number }[]>;
  getAiUsageByPushEventId(pushEventId: string, userId: string): Promise<AiUsage | undefined>;
  createAiUsage(aiUsage: InsertAiUsage): Promise<AiUsage>;
  updateAiUsage(pushEventId: string, userId: string, updates: Partial<AiUsage>): Promise<AiUsage | undefined>;
  deleteAiUsage(pushEventId: string, userId: string): Promise<boolean>;

  // Analytics methods
  getStatsForUser(userId: string): Promise<AnalyticsStats>;
  getAnalyticsPushesByDay(userId: string, startDate: Date): Promise<{ date: string; count: number }[]>;
  getAnalyticsTopRepos(userId: string, limit?: number): Promise<{ repositoryId: string; name: string; fullName: string; pushCount: number; totalAdditions: number; totalDeletions: number }[]>;
  getAnalyticsSlackByDay(userId: string, startDate: Date): Promise<{ date: string; count: number }[]>;
  getAnalyticsAiModelUsage(userId: string): Promise<{ model: string; count: number }[]>;

  // Notification methods
  getNotificationsByUserId(userId: string, options?: { limit?: number; offset?: number }): Promise<Notification[]>;
  getNotificationCountForUser(userId: string): Promise<number>;
  getNotificationByIdAndUserId(id: string, userId: string): Promise<Notification | undefined>;
  hasNotificationOfType(userId: string, type: string): Promise<boolean>;
  getUnreadNotificationsByUserId(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  deleteNotification(id: string): Promise<boolean>;
  deleteAllNotifications(userId: string): Promise<boolean>;
}

function newUuid(): string {
  return crypto.randomUUID();
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private repositories: Map<string, Repository> = new Map();
  private integrations: Map<string, Integration> = new Map();
  private pushEvents: Map<string, PushEvent> = new Map();
  private slackWorkspaces: Map<string, SlackWorkspace> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private analyticsStats: Map<string, AnalyticsStats> = new Map();
  private aiUsage: Map<string, AiUsage> = new Map();

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async getUserByGithubId(githubId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.githubId === githubId);
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.verificationToken === token);
  }

  async getAllUserIds(): Promise<string[]> {
    return Array.from(this.users.keys());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = newUuid();
    const user: User = { 
      ...insertUser, 
      id, 
      email: insertUser.email || null,
      password: insertUser.password || null,
      githubId: insertUser.githubId || null,
      githubToken: insertUser.githubToken || null,
      slackUserId: null,
      createdAt: new Date().toISOString()
    } as any;
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Repository methods
  async getRepository(id: string): Promise<Repository | undefined> {
    return this.repositories.get(id);
  }

  async getRepositoriesByUserId(userId: string): Promise<Repository[]> {
    return Array.from(this.repositories.values()).filter(repo => repo.userId === userId);
  }

  async getRepositoryByGithubId(githubId: string): Promise<Repository | undefined> {
    return Array.from(this.repositories.values()).find(repo => repo.githubId === githubId);
  }

  async createRepository(repository: InsertRepository): Promise<Repository> {
    const id = newUuid();
    const newRepository: Repository = {
      ...repository,
      id,
      branch: repository.branch || null,
      isActive: repository.isActive ?? null,
      monitorAllBranches: repository.monitorAllBranches ?? null,
      webhookId: repository.webhookId || null,
      criticalPaths: repository.criticalPaths ?? null,
      incidentServiceName: repository.incidentServiceName ?? null,
      createdAt: new Date().toISOString(),
    };
    this.repositories.set(id, newRepository);
    return newRepository;
  }

  async updateRepository(id: string, updates: Partial<Repository>): Promise<Repository | undefined> {
    const repository = this.repositories.get(id);
    if (!repository) return undefined;
    const updatedRepository = { ...repository, ...updates };
    this.repositories.set(id, updatedRepository);
    return updatedRepository;
  }

  async deleteRepository(id: string): Promise<boolean> {
    return this.repositories.delete(id);
  }

  // Integration methods
  async getIntegration(id: string): Promise<Integration | undefined> {
    return this.integrations.get(id);
  }

  async getIntegrationsByUserId(userId: string): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter(integration => integration.userId === userId);
  }

  async getIntegrationsByRepositoryId(repositoryId: string): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter(integration => integration.repositoryId === repositoryId);
  }

  async getIntegrationByRepositoryId(repositoryId: string): Promise<Integration | undefined> {
    return Array.from(this.integrations.values()).find(integration => integration.repositoryId === repositoryId);
  }

  async getIntegrationsBySlackChannel(workspaceId: string, channelId: string): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter(
      i => i.slackWorkspaceId === workspaceId && i.slackChannelId === channelId
    );
  }

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const id = newUuid();
    const newIntegration: Integration = {
      ...integration,
      id,
      slackWorkspaceId: integration.slackWorkspaceId ?? null,
      isActive: integration.isActive ?? null,
      notificationLevel: integration.notificationLevel || null,
      includeCommitSummaries: integration.includeCommitSummaries ?? null,
      aiModel: integration.aiModel ?? null,
      maxTokens: integration.maxTokens ?? null,
      createdAt: new Date().toISOString(),
      openRouterApiKey: integration.openRouterApiKey ?? null
    };
    this.integrations.set(id, newIntegration);
    return newIntegration;
  }

  async updateIntegration(id: string, updates: Partial<Integration>): Promise<Integration | undefined> {
    const integration = this.integrations.get(id);
    if (!integration) return undefined;
    const updatedIntegration = { ...integration, ...updates };
    this.integrations.set(id, updatedIntegration);
    return updatedIntegration;
  }

  async deleteIntegration(id: string): Promise<boolean> {
    return this.integrations.delete(id);
  }

  // Push event methods
  async getPushEvent(id: string): Promise<PushEvent | undefined> {
    return this.pushEvents.get(id);
  }

  async getPushEventsByRepositoryId(repositoryId: string, options?: { limit?: number; offset?: number }): Promise<PushEvent[]> {
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    const list = Array.from(this.pushEvents.values())
      .filter(event => event.repositoryId === repositoryId)
      .sort((a, b) => new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime())
      .slice(offset, offset + limit);
    return list;
  }

  async getPushEventsForUser(userId: string, options?: { limit?: number; offset?: number } & ListPushEventsFilters): Promise<PushEvent[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const { repositoryId, from, to, minImpact } = options ?? {};
    const repoIds = new Set(Array.from(this.repositories.values()).filter(r => r.userId === userId).map(r => r.id));
    let list = Array.from(this.pushEvents.values()).filter(event => repoIds.has(event.repositoryId));
    if (repositoryId != null) list = list.filter(e => e.repositoryId === repositoryId);
    if (from) list = list.filter(e => new Date(e.pushedAt).getTime() >= new Date(from).getTime());
    if (to) list = list.filter(e => new Date(e.pushedAt).getTime() <= new Date(to + "T23:59:59.999Z").getTime());
    if (minImpact != null) list = list.filter(e => (e.impactScore ?? 0) >= minImpact);
    list.sort((a, b) => new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime());
    return list.slice(offset, offset + limit);
  }

  async getPushEventCountForUser(userId: string, filters?: ListPushEventsFilters): Promise<number> {
    const repoIds = new Set(Array.from(this.repositories.values()).filter(r => r.userId === userId).map(r => r.id));
    let list = Array.from(this.pushEvents.values()).filter(event => repoIds.has(event.repositoryId));
    const { repositoryId, from, to, minImpact } = filters ?? {};
    if (repositoryId != null) list = list.filter(e => e.repositoryId === repositoryId);
    if (from) list = list.filter(e => new Date(e.pushedAt).getTime() >= new Date(from).getTime());
    if (to) list = list.filter(e => new Date(e.pushedAt).getTime() <= new Date(to + "T23:59:59.999Z").getTime());
    if (minImpact != null) list = list.filter(e => (e.impactScore ?? 0) >= minImpact);
    return list.length;
  }

  async searchPushEvents(userId: string, options: SearchPushEventsOptions): Promise<PushEvent[]> {
    const { q, repositoryId, from, to, minImpact, limit = 50, offset = 0 } = options;
    const query = (q ?? '').trim().toLowerCase();
    if (!query) return [];
    const repoIds = new Set(Array.from(this.repositories.values()).filter(r => r.userId === userId).map(r => r.id));
    if (repoIds.size === 0) return [];
    let list = Array.from(this.pushEvents.values()).filter(event => repoIds.has(event.repositoryId));
    const match = (s: string | null | undefined) => (s ?? '').toLowerCase().includes(query);
    list = list.filter(event =>
      match(event.aiSummary) || match(event.commitMessage) || match(event.author) || match(event.aiImpact) || match(event.aiCategory)
    );
    if (repositoryId != null) list = list.filter(e => e.repositoryId === repositoryId);
    if (from) {
      const t = new Date(from).getTime();
      list = list.filter(e => new Date(e.pushedAt).getTime() >= t);
    }
    if (to) {
      const t = new Date(to).getTime();
      list = list.filter(e => new Date(e.pushedAt).getTime() <= t);
    }
    if (minImpact != null) list = list.filter(e => (e.impactScore ?? 0) >= minImpact);
    list.sort((a, b) => new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime());
    return list.slice(offset, offset + limit);
  }

  async createPushEvent(pushEvent: InsertPushEvent): Promise<PushEvent> {
    const id = newUuid();
    const newPushEvent: PushEvent = {
      ...pushEvent,
      id,
      notificationSent: pushEvent.notificationSent ?? null,
      aiSummary: pushEvent.aiSummary ?? null,
      aiImpact: pushEvent.aiImpact ?? null,
      aiCategory: pushEvent.aiCategory ?? null,
      aiDetails: pushEvent.aiDetails ?? null,
      aiGenerated: pushEvent.aiGenerated ?? false,
      impactScore: pushEvent.impactScore ?? null,
      riskFlags: pushEvent.riskFlags ?? null,
      riskMetadata: pushEvent.riskMetadata ?? null,
      createdAt: new Date().toISOString(),
      additions: pushEvent.additions ?? null,
      deletions: pushEvent.deletions ?? null,
      searchVector: null, // generated column; not set in MemStorage
    };
    this.pushEvents.set(id, newPushEvent);
    return newPushEvent;
  }

  async updatePushEvent(id: string, updates: Partial<PushEvent>): Promise<PushEvent | undefined> {
    const pushEvent = this.pushEvents.get(id);
    if (!pushEvent) return undefined;
    const updatedPushEvent = { ...pushEvent, ...updates };
    this.pushEvents.set(id, updatedPushEvent);
    return updatedPushEvent;
  }

  // Slack workspace methods
  async getSlackWorkspace(id: string): Promise<SlackWorkspace | undefined> {
    return this.slackWorkspaces.get(id);
  }

  async getSlackWorkspacesByUserId(userId: string): Promise<SlackWorkspace[]> {
    return Array.from(this.slackWorkspaces.values()).filter(workspace => workspace.userId === userId);
  }

  async getSlackWorkspaceByTeamId(teamId: string): Promise<SlackWorkspace | undefined> {
    return Array.from(this.slackWorkspaces.values()).find(workspace => workspace.teamId === teamId);
  }

  async createSlackWorkspace(workspace: InsertSlackWorkspace): Promise<SlackWorkspace> {
    const id = newUuid();
    const newWorkspace: SlackWorkspace = {
      ...workspace,
      id,
      createdAt: new Date().toISOString()
    };
    this.slackWorkspaces.set(id, newWorkspace);
    return newWorkspace;
  }

  async updateSlackWorkspace(id: string, updates: Partial<SlackWorkspace>): Promise<SlackWorkspace | undefined> {
    const slackWorkspace = this.slackWorkspaces.get(id);
    if (!slackWorkspace) return undefined;
    const updatedSlackWorkspace = { ...slackWorkspace, ...updates };
    this.slackWorkspaces.set(id, updatedSlackWorkspace);
    return updatedSlackWorkspace;
  }

  async deleteSlackWorkspace(workspaceId: string, userId: string): Promise<boolean> {
    const slackWorkspace = this.slackWorkspaces.get(workspaceId);
    if (!slackWorkspace || slackWorkspace.userId !== userId) return false;
    Array.from(this.integrations.values()).forEach((integration) => {
      if (integration.slackWorkspaceId === workspaceId) {
        (integration as any).isActive = false;
        (integration as any).slackWorkspaceId = null;
        (integration as any).slackChannelId = "";
      }
    });
    this.slackWorkspaces.delete(workspaceId);
    return true;
  }

  // OpenRouter methods
  /** Get the user's OpenRouter usage history (bounded by limit when provided). */
  async getAiUsageByUserId(userId: string, options?: { limit?: number }): Promise<AiUsage[]> {
    const list = Array.from(this.aiUsage.values())
      .filter(usage => usage.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as AiUsage[];
    const limit = options?.limit ?? 1000;
    return limit ? list.slice(0, limit) : list;
  }

  async getMonthlyAiSpend(userId: string, monthStart: Date): Promise<number> {
    const list = Array.from(this.aiUsage.values()).filter(u => u.userId === userId && new Date(u.createdAt) >= monthStart);
    return list.reduce((sum, u) => sum + (typeof u.cost === "number" ? u.cost : Number(u.cost) || 0), 0);
  }

  async getMonthlyAiSummary(userId: string, monthStart: Date): Promise<{ totalSpend: number; callCount: number }> {
    const list = Array.from(this.aiUsage.values()).filter(u => u.userId === userId && new Date(u.createdAt) >= monthStart);
    const totalSpend = list.reduce((sum, u) => sum + (typeof u.cost === "number" ? u.cost : Number(u.cost) || 0), 0);
    return { totalSpend, callCount: list.length };
  }

  async getAiUsageCountForUser(userId: string): Promise<number> {
    return Array.from(this.aiUsage.values()).filter(u => u.userId === userId).length;
  }

  async getAiUsageDailyByUserId(userId: string, startDate: Date): Promise<{ date: string; totalCost: number; callCount: number }[]> {
    const list = Array.from(this.aiUsage.values()).filter(u => u.userId === userId && new Date(u.createdAt) >= startDate);
    const byDay: Record<string, { totalCost: number; callCount: number }> = {};
    for (const u of list) {
      const d = new Date(u.createdAt);
      const key = d.toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = { totalCost: 0, callCount: 0 };
      byDay[key].totalCost += typeof u.cost === "number" ? u.cost : Number(u.cost) || 0;
      byDay[key].callCount += 1;
    }
    return Object.entries(byDay).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getAiUsageByModelForAnalytics(userId: string, startDate?: Date): Promise<{ model: string; cost: number; calls: number; tokens: number }[]> {
    let list = Array.from(this.aiUsage.values()).filter(u => u.userId === userId);
    if (startDate) list = list.filter(u => new Date(u.createdAt) >= startDate);
    const byModel: Record<string, { cost: number; calls: number; tokens: number }> = {};
    for (const u of list) {
      const m = String(u.model ?? "unknown");
      if (!byModel[m]) byModel[m] = { cost: 0, calls: 0, tokens: 0 };
      byModel[m].cost += typeof u.cost === "number" ? u.cost : Number(u.cost) || 0;
      byModel[m].calls += 1;
      byModel[m].tokens += typeof u.tokensUsed === "number" ? u.tokensUsed : Number(u.tokensUsed) || 0;
    }
    return Object.entries(byModel).map(([model, v]) => ({ model, ...v })).sort((a, b) => b.cost - a.cost);
  }

  /** Get the OpenRouter usage for a specific push event. */
  async getAiUsageByPushEventId(pushEventId: string, userId: string): Promise<AiUsage | undefined> {
    return Array.from(this.aiUsage.values()).find(usage => usage.userId === userId && usage.pushEventId === pushEventId);
  }

  async createAiUsage(aiUsage: InsertAiUsage): Promise<AiUsage> {
    const id = newUuid();
    const newAiUsage: AiUsage = {
      ...aiUsage,
      id,
      openrouterGenerationId: aiUsage.openrouterGenerationId ?? null,
      createdAt: new Date().toISOString()
    };
    this.aiUsage.set(id, newAiUsage);
    return newAiUsage;
  }

  async updateAiUsage(pushEventId: string, userId: string, updates: Partial<AiUsage>): Promise<AiUsage | undefined> {
    const usage = Array.from(this.aiUsage.values()).find(u => u.pushEventId === pushEventId && u.userId === userId);
    if (!usage) return undefined;
    const updatedAiUsage = { ...usage, ...updates } as AiUsage;
    this.aiUsage.set(usage.id, updatedAiUsage);
    return updatedAiUsage;
  }

  async deleteAiUsage(pushEventId: string, userId: string): Promise<boolean> {
    const usage = Array.from(this.aiUsage.values()).find(u => u.pushEventId === pushEventId && u.userId === userId);
    if (!usage) return false;
    return this.aiUsage.delete(usage.id);
  }

  // Analytics methods
  async getStatsForUser(userId: string): Promise<AnalyticsStats> {
    const analyticsStats = Array.from(this.analyticsStats.values()).find(s => s.userId === userId);
    if (analyticsStats) return analyticsStats;

    const userIntegrations = await this.getIntegrationsByUserId(userId);
    const userRepositories = await this.getRepositoriesByUserId(userId);
    
    const activeIntegrations = userIntegrations.filter(integration => integration.isActive).length;
    const totalRepositories = userRepositories.length;
    
    // Calculate daily pushes (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const allPushEvents = Array.from(this.pushEvents.values());
    const dailyPushes = allPushEvents.filter(event => 
      userRepositories.some(repo => repo.id === event.repositoryId) &&
      event.pushedAt > oneDayAgo
    ).length;
    
    const totalNotifications = allPushEvents.filter(event => 
      userRepositories.some(repo => repo.id === event.repositoryId) &&
      event.notificationSent
    ).length;

    const newAnalyticsStats: AnalyticsStats = {
      id: newUuid(),
      userId,
      activeIntegrations,
      totalRepositories,
      dailyPushes,
      totalNotifications,
      createdAt: new Date().toISOString()
    };
    this.analyticsStats.set(newAnalyticsStats.id, newAnalyticsStats);
    return newAnalyticsStats;
  }

  async getAnalyticsPushesByDay(userId: string, startDate: Date): Promise<{ date: string; count: number }[]> {
    const repoIds = new Set(Array.from(this.repositories.values()).filter(r => r.userId === userId).map(r => r.id));
    const events = Array.from(this.pushEvents.values()).filter(e => repoIds.has(e.repositoryId) && new Date(e.pushedAt) >= startDate);
    const byDay: Record<string, number> = {};
    for (const e of events) {
      const key = new Date(e.pushedAt).toISOString().slice(0, 10);
      byDay[key] = (byDay[key] ?? 0) + 1;
    }
    return Object.entries(byDay).map(([date, count]) => ({ date, count }));
  }

  async getAnalyticsTopRepos(userId: string, limit: number = 10): Promise<{ repositoryId: string; name: string; fullName: string; pushCount: number; totalAdditions: number; totalDeletions: number }[]> {
    const userRepos = Array.from(this.repositories.values()).filter(r => r.userId === userId);
    const events = Array.from(this.pushEvents.values());
    const result = userRepos.map(repo => {
      const repoEvents = events.filter(e => e.repositoryId === repo.id);
      const totalAdditions = repoEvents.reduce((s, e) => s + ((e as any).additions ?? 0), 0);
      const totalDeletions = repoEvents.reduce((s, e) => s + ((e as any).deletions ?? 0), 0);
      return {
        repositoryId: repo.id,
        name: repo.name,
        fullName: repo.fullName,
        pushCount: repoEvents.length,
        totalAdditions,
        totalDeletions,
      };
    });
    result.sort((a, b) => (b.totalAdditions + b.totalDeletions) - (a.totalAdditions + a.totalDeletions));
    return result.slice(0, limit);
  }

  async getAnalyticsSlackByDay(userId: string, startDate: Date): Promise<{ date: string; count: number }[]> {
    const notifs = Array.from(this.notifications.values())
      .filter(n => n.userId === userId && n.type === "slack_message_sent" && new Date(n.createdAt) >= startDate);
    const byDay: Record<string, number> = {};
    for (const n of notifs) {
      const key = new Date(n.createdAt).toISOString().slice(0, 10);
      byDay[key] = (byDay[key] ?? 0) + 1;
    }
    return Object.entries(byDay).map(([date, count]) => ({ date, count }));
  }

  async getAnalyticsAiModelUsage(userId: string): Promise<{ model: string; count: number }[]> {
    const usage = Array.from(this.aiUsage.values()).filter(u => u.userId === userId);
    const byModel: Record<string, number> = {};
    for (const u of usage) {
      const model = (u as any).model ?? "unknown";
      byModel[model] = (byModel[model] ?? 0) + 1;
    }
    return Object.entries(byModel)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Notification methods
  async getNotificationsByUserId(userId: string, options?: { limit?: number; offset?: number }): Promise<Notification[]> {
    let list = Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const offset = options?.offset ?? 0;
    if (options?.limit != null) list = list.slice(offset, offset + options.limit);
    else if (offset > 0) list = list.slice(offset);
    return list;
  }

  async getNotificationCountForUser(userId: string): Promise<number> {
    return Array.from(this.notifications.values()).filter(n => n.userId === userId).length;
  }

  async getNotificationByIdAndUserId(id: string, userId: string): Promise<Notification | undefined> {
    const n = this.notifications.get(id);
    return n && n.userId === userId ? n : undefined;
  }

  async hasNotificationOfType(userId: string, type: string): Promise<boolean> {
    return Array.from(this.notifications.values()).some(n => n.userId === userId && n.type === type);
  }

  async getUnreadNotificationsByUserId(userId: string): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId && !notification.isRead)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const id = newUuid();
    const newNotification: Notification = {
      ...notification,
      id,
      title: notification.title || null,
      metadata: notification.metadata || null,
      isRead: notification.isRead ?? false,
      createdAt: new Date().toISOString()
    };
    this.notifications.set(id, newNotification);
    return newNotification;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const notification = this.notifications.get(id);
    if (!notification) return undefined;
    const updatedNotification = { ...notification, isRead: true };
    this.notifications.set(id, updatedNotification);
    return updatedNotification;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    const userNotifications = Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId);
    
    userNotifications.forEach(notification => {
      this.notifications.set(notification.id, { ...notification, isRead: true });
    });
  }

  async deleteNotification(id: string): Promise<boolean> {
    return this.notifications.delete(id);
  }

  async deleteAllNotifications(userId: string): Promise<boolean> {
    const userNotifications = Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId);
    
    userNotifications.forEach(notification => {
      this.notifications.delete(notification.id);
    });
    return true;
  }
}

// Export a singleton instance of DatabaseStorage
export const storage = new DatabaseStorage();