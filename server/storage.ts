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

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGithubId(githubId: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;

  // Repository methods
  getRepository(id: number): Promise<Repository | undefined>;
  getRepositoriesByUserId(userId: number): Promise<Repository[]>;
  getRepositoryByGithubId(githubId: string): Promise<Repository | undefined>;
  createRepository(repository: InsertRepository): Promise<Repository>;
  updateRepository(id: number, updates: Partial<Repository>): Promise<Repository | undefined>;
  deleteRepository(id: number): Promise<boolean>;

  // Integration methods
  getIntegration(id: number): Promise<Integration | undefined>;
  getIntegrationsByUserId(userId: number): Promise<Integration[]>;
  getIntegrationsByRepositoryId(repositoryId: number): Promise<Integration[]>;
  getIntegrationByRepositoryId(repositoryId: number): Promise<Integration | undefined>;
  getIntegrationsBySlackChannel(workspaceId: number, channelId: string): Promise<Integration[]>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: number, updates: Partial<Integration>): Promise<Integration | undefined>;
  deleteIntegration(id: number): Promise<boolean>;

  // Push event methods
  getPushEvent(id: number): Promise<PushEvent | undefined>;
  getPushEventsByRepositoryId(repositoryId: number, options?: { limit?: number; offset?: number }): Promise<PushEvent[]>;
  getPushEventsForUser(userId: number, options?: { limit?: number; offset?: number }): Promise<PushEvent[]>;
  getPushEventCountForUser(userId: number): Promise<number>;
  createPushEvent(pushEvent: InsertPushEvent): Promise<PushEvent>;
  updatePushEvent(id: number, updates: Partial<PushEvent>): Promise<PushEvent | undefined>;

  // Slack workspace methods
  getSlackWorkspace(id: number): Promise<SlackWorkspace | undefined>;
  getSlackWorkspacesByUserId(userId: number): Promise<SlackWorkspace[]>;
  getSlackWorkspaceByTeamId(teamId: string): Promise<SlackWorkspace | undefined>;
  createSlackWorkspace(workspace: InsertSlackWorkspace): Promise<SlackWorkspace>;
  updateSlackWorkspace(id: number, updates: Partial<SlackWorkspace>): Promise<SlackWorkspace | undefined>;

  // OpenRouter methods
  getAiUsageByUserId(userId: number): Promise<AiUsage[]>;
  getMonthlyAiSpend(userId: number, monthStart: Date): Promise<number>;
  getMonthlyAiSummary(userId: number, monthStart: Date): Promise<{ totalSpend: number; callCount: number }>;
  getAiUsageCountForUser(userId: number): Promise<number>;
  getAiUsageDailyByUserId(userId: number, startDate: Date): Promise<{ date: string; totalCost: number; callCount: number }[]>;
  getAiUsageByModelForAnalytics(userId: number, startDate?: Date): Promise<{ model: string; cost: number; calls: number; tokens: number }[]>;
  getAiUsageByPushEventId(pushEventId: number, userId: number): Promise<AiUsage | undefined>;
  createAiUsage(aiUsage: InsertAiUsage): Promise<AiUsage>;
  updateAiUsage(pushEventId: number, userId: number, updates: Partial<AiUsage>): Promise<AiUsage | undefined>;
  deleteAiUsage(pushEventId: number, userId: number): Promise<boolean>;

  // Analytics methods
  getStatsForUser(userId: number): Promise<AnalyticsStats>;
  getAnalyticsPushesByDay(userId: number, startDate: Date): Promise<{ date: string; count: number }[]>;
  getAnalyticsTopRepos(userId: number, limit?: number): Promise<{ repositoryId: number; name: string; fullName: string; pushCount: number; totalAdditions: number; totalDeletions: number }[]>;
  getAnalyticsSlackByDay(userId: number, startDate: Date): Promise<{ date: string; count: number }[]>;
  getAnalyticsAiModelUsage(userId: number): Promise<{ model: string; count: number }[]>;

  // Notification methods
  getNotificationsByUserId(userId: number, options?: { limit?: number; offset?: number }): Promise<Notification[]>;
  getNotificationCountForUser(userId: number): Promise<number>;
  getNotificationByIdAndUserId(id: number, userId: number): Promise<Notification | undefined>;
  hasNotificationOfType(userId: number, type: string): Promise<boolean>;
  getUnreadNotificationsByUserId(userId: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: number): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: number): Promise<void>;
  deleteNotification(id: number): Promise<boolean>;
  deleteAllNotifications(userId: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private repositories: Map<number, Repository> = new Map();
  private integrations: Map<number, Integration> = new Map();
  private pushEvents: Map<number, PushEvent> = new Map();
  private slackWorkspaces: Map<number, SlackWorkspace> = new Map();
  private notifications: Map<number, Notification> = new Map();
  private currentUserId = 1;
  private currentRepositoryId = 1;
  private currentIntegrationId = 1;
  private currentPushEventId = 1;
  private currentSlackWorkspaceId = 1;
  private currentNotificationId = 1;
  private analyticsStats: Map<number, AnalyticsStats> = new Map();
  private currentAnalyticsStatsId = 1;
  private aiUsage: Map<number, AiUsage> = new Map();
  private currentAiUsageId = 1;

  // User methods
  async getUser(id: number): Promise<User | undefined> {
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
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

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Repository methods
  async getRepository(id: number): Promise<Repository | undefined> {
    return this.repositories.get(id);
  }

  async getRepositoriesByUserId(userId: number): Promise<Repository[]> {
    return Array.from(this.repositories.values()).filter(repo => repo.userId === userId);
  }

  async getRepositoryByGithubId(githubId: string): Promise<Repository | undefined> {
    return Array.from(this.repositories.values()).find(repo => repo.githubId === githubId);
  }

  async createRepository(repository: InsertRepository): Promise<Repository> {
    const id = this.currentRepositoryId++;
    const newRepository: Repository = {
      ...repository,
      id,
      branch: repository.branch || null,
      isActive: repository.isActive ?? null,
      monitorAllBranches: repository.monitorAllBranches ?? null,
      webhookId: repository.webhookId || null,
      createdAt: new Date().toISOString()
    };
    this.repositories.set(id, newRepository);
    return newRepository;
  }

  async updateRepository(id: number, updates: Partial<Repository>): Promise<Repository | undefined> {
    const repository = this.repositories.get(id);
    if (!repository) return undefined;
    const updatedRepository = { ...repository, ...updates };
    this.repositories.set(id, updatedRepository);
    return updatedRepository;
  }

  async deleteRepository(id: number): Promise<boolean> {
    return this.repositories.delete(id);
  }

  // Integration methods
  async getIntegration(id: number): Promise<Integration | undefined> {
    return this.integrations.get(id);
  }

  async getIntegrationsByUserId(userId: number): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter(integration => integration.userId === userId);
  }

  async getIntegrationsByRepositoryId(repositoryId: number): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter(integration => integration.repositoryId === repositoryId);
  }

  async getIntegrationByRepositoryId(repositoryId: number): Promise<Integration | undefined> {
    return Array.from(this.integrations.values()).find(integration => integration.repositoryId === repositoryId);
  }

  async getIntegrationsBySlackChannel(workspaceId: number, channelId: string): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter(
      i => i.slackWorkspaceId === workspaceId && i.slackChannelId === channelId
    );
  }

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const id = this.currentIntegrationId++;
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

  async updateIntegration(id: number, updates: Partial<Integration>): Promise<Integration | undefined> {
    const integration = this.integrations.get(id);
    if (!integration) return undefined;
    const updatedIntegration = { ...integration, ...updates };
    this.integrations.set(id, updatedIntegration);
    return updatedIntegration;
  }

  async deleteIntegration(id: number): Promise<boolean> {
    return this.integrations.delete(id);
  }

  // Push event methods
  async getPushEvent(id: number): Promise<PushEvent | undefined> {
    return this.pushEvents.get(id);
  }

  async getPushEventsByRepositoryId(repositoryId: number, options?: { limit?: number; offset?: number }): Promise<PushEvent[]> {
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    const list = Array.from(this.pushEvents.values())
      .filter(event => event.repositoryId === repositoryId)
      .sort((a, b) => new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime())
      .slice(offset, offset + limit);
    return list;
  }

  async getPushEventsForUser(userId: number, options?: { limit?: number; offset?: number }): Promise<PushEvent[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const repoIds = new Set(Array.from(this.repositories.values()).filter(r => r.userId === userId).map(r => r.id));
    const list = Array.from(this.pushEvents.values())
      .filter(event => repoIds.has(event.repositoryId))
      .sort((a, b) => new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime())
      .slice(offset, offset + limit);
    return list;
  }

  async getPushEventCountForUser(userId: number): Promise<number> {
    const repoIds = new Set(Array.from(this.repositories.values()).filter(r => r.userId === userId).map(r => r.id));
    return Array.from(this.pushEvents.values()).filter(event => repoIds.has(event.repositoryId)).length;
  }

  async createPushEvent(pushEvent: InsertPushEvent): Promise<PushEvent> {
    const id = this.currentPushEventId++;
    const newPushEvent: PushEvent = {
      ...pushEvent,
      id,
      notificationSent: pushEvent.notificationSent ?? null,
      aiSummary: pushEvent.aiSummary ?? null,
      aiImpact: pushEvent.aiImpact ?? null,
      aiCategory: pushEvent.aiCategory ?? null,
      aiDetails: pushEvent.aiDetails ?? null,
      aiGenerated: pushEvent.aiGenerated ?? false,
      createdAt: new Date().toISOString(),
      additions: pushEvent.additions ?? null,
      deletions: pushEvent.deletions ?? null
    };
    this.pushEvents.set(id, newPushEvent);
    return newPushEvent;
  }

  async updatePushEvent(id: number, updates: Partial<PushEvent>): Promise<PushEvent | undefined> {
    const pushEvent = this.pushEvents.get(id);
    if (!pushEvent) return undefined;
    const updatedPushEvent = { ...pushEvent, ...updates };
    this.pushEvents.set(id, updatedPushEvent);
    return updatedPushEvent;
  }

  // Slack workspace methods
  async getSlackWorkspace(id: number): Promise<SlackWorkspace | undefined> {
    return this.slackWorkspaces.get(id);
  }

  async getSlackWorkspacesByUserId(userId: number): Promise<SlackWorkspace[]> {
    return Array.from(this.slackWorkspaces.values()).filter(workspace => workspace.userId === userId);
  }

  async getSlackWorkspaceByTeamId(teamId: string): Promise<SlackWorkspace | undefined> {
    return Array.from(this.slackWorkspaces.values()).find(workspace => workspace.teamId === teamId);
  }

  async createSlackWorkspace(workspace: InsertSlackWorkspace): Promise<SlackWorkspace> {
    const id = this.currentSlackWorkspaceId++;
    const newWorkspace: SlackWorkspace = {
      ...workspace,
      id,
      createdAt: new Date().toISOString()
    };
    this.slackWorkspaces.set(id, newWorkspace);
    return newWorkspace;
  }

  async updateSlackWorkspace(id: number, updates: Partial<SlackWorkspace>): Promise<SlackWorkspace | undefined> {
    const slackWorkspace = this.slackWorkspaces.get(id);
    if (!slackWorkspace) return undefined;
    const updatedSlackWorkspace = { ...slackWorkspace, ...updates };
    this.slackWorkspaces.set(id, updatedSlackWorkspace);
    return updatedSlackWorkspace;
  }

  // OpenRouter methods
  /** Get the user's OpenRouter usage history. */
  async getAiUsageByUserId(userId: number): Promise<AiUsage[]> {
    return Array.from(this.aiUsage.values()).filter(usage => usage.userId === userId) as AiUsage[];
  }

  async getMonthlyAiSpend(userId: number, monthStart: Date): Promise<number> {
    const list = Array.from(this.aiUsage.values()).filter(u => u.userId === userId && new Date(u.createdAt) >= monthStart);
    return list.reduce((sum, u) => sum + (typeof u.cost === "number" ? u.cost : Number(u.cost) || 0), 0);
  }

  async getMonthlyAiSummary(userId: number, monthStart: Date): Promise<{ totalSpend: number; callCount: number }> {
    const list = Array.from(this.aiUsage.values()).filter(u => u.userId === userId && new Date(u.createdAt) >= monthStart);
    const totalSpend = list.reduce((sum, u) => sum + (typeof u.cost === "number" ? u.cost : Number(u.cost) || 0), 0);
    return { totalSpend, callCount: list.length };
  }

  async getAiUsageCountForUser(userId: number): Promise<number> {
    return Array.from(this.aiUsage.values()).filter(u => u.userId === userId).length;
  }

  async getAiUsageDailyByUserId(userId: number, startDate: Date): Promise<{ date: string; totalCost: number; callCount: number }[]> {
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

  async getAiUsageByModelForAnalytics(userId: number, startDate?: Date): Promise<{ model: string; cost: number; calls: number; tokens: number }[]> {
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
  async getAiUsageByPushEventId(pushEventId: number, userId: number): Promise<AiUsage | undefined> {
    return Array.from(this.aiUsage.values()).filter(usage => usage.userId === userId && usage.pushEventId === pushEventId).shift();
  }

  async createAiUsage(aiUsage: InsertAiUsage): Promise<AiUsage> {
    const id = this.currentAiUsageId++;
    const newAiUsage: AiUsage = {
      ...aiUsage,
      id,
      openrouterGenerationId: aiUsage.openrouterGenerationId ?? null,
      createdAt: new Date().toISOString()
    };
    this.aiUsage.set(id, newAiUsage);
    return newAiUsage;
  }

  async updateAiUsage(pushEventId: number, userId: number, updates: Partial<AiUsage>): Promise<AiUsage | undefined> {
    const aiUsage = this.aiUsage.get(pushEventId) as AiUsage | undefined;
    if (!aiUsage || aiUsage.userId !== userId) return undefined;
    const updatedAiUsage = { ...aiUsage, ...updates } as AiUsage;
    this.aiUsage.set(pushEventId, updatedAiUsage);
    return updatedAiUsage;
  }

  async deleteAiUsage(pushEventId: number, userId: number): Promise<boolean> {
    const aiUsage = this.aiUsage.get(pushEventId) as AiUsage | undefined;
    if (!aiUsage || aiUsage.userId !== userId) return false;
    return this.aiUsage.delete(pushEventId);
  }

  // Analytics methods
  async getStatsForUser(userId: number): Promise<AnalyticsStats> {
    const analyticsStats = this.analyticsStats.get(userId);
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
      id: this.currentAnalyticsStatsId++,
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

  async getAnalyticsPushesByDay(userId: number, startDate: Date): Promise<{ date: string; count: number }[]> {
    const repoIds = new Set(Array.from(this.repositories.values()).filter(r => r.userId === userId).map(r => r.id));
    const events = Array.from(this.pushEvents.values()).filter(e => repoIds.has(e.repositoryId) && new Date(e.pushedAt) >= startDate);
    const byDay: Record<string, number> = {};
    for (const e of events) {
      const key = new Date(e.pushedAt).toISOString().slice(0, 10);
      byDay[key] = (byDay[key] ?? 0) + 1;
    }
    return Object.entries(byDay).map(([date, count]) => ({ date, count }));
  }

  async getAnalyticsTopRepos(userId: number, limit: number = 10): Promise<{ repositoryId: number; name: string; fullName: string; pushCount: number; totalAdditions: number; totalDeletions: number }[]> {
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

  async getAnalyticsSlackByDay(userId: number, startDate: Date): Promise<{ date: string; count: number }[]> {
    const notifs = Array.from(this.notifications.values())
      .filter(n => n.userId === userId && n.type === "slack_message_sent" && new Date(n.createdAt) >= startDate);
    const byDay: Record<string, number> = {};
    for (const n of notifs) {
      const key = new Date(n.createdAt).toISOString().slice(0, 10);
      byDay[key] = (byDay[key] ?? 0) + 1;
    }
    return Object.entries(byDay).map(([date, count]) => ({ date, count }));
  }

  async getAnalyticsAiModelUsage(userId: number): Promise<{ model: string; count: number }[]> {
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
  async getNotificationsByUserId(userId: number, options?: { limit?: number; offset?: number }): Promise<Notification[]> {
    let list = Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const offset = options?.offset ?? 0;
    if (options?.limit != null) list = list.slice(offset, offset + options.limit);
    else if (offset > 0) list = list.slice(offset);
    return list;
  }

  async getNotificationCountForUser(userId: number): Promise<number> {
    return Array.from(this.notifications.values()).filter(n => n.userId === userId).length;
  }

  async getNotificationByIdAndUserId(id: number, userId: number): Promise<Notification | undefined> {
    const n = this.notifications.get(id);
    return n && n.userId === userId ? n : undefined;
  }

  async hasNotificationOfType(userId: number, type: string): Promise<boolean> {
    return Array.from(this.notifications.values()).some(n => n.userId === userId && n.type === type);
  }

  async getUnreadNotificationsByUserId(userId: number): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId && !notification.isRead)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const id = this.currentNotificationId++;
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

  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    const notification = this.notifications.get(id);
    if (!notification) return undefined;
    const updatedNotification = { ...notification, isRead: true };
    this.notifications.set(id, updatedNotification);
    return updatedNotification;
  }

  async markAllNotificationsAsRead(userId: number): Promise<void> {
    const userNotifications = Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId);
    
    userNotifications.forEach(notification => {
      this.notifications.set(notification.id, { ...notification, isRead: true });
    });
  }

  async deleteNotification(id: number): Promise<boolean> {
    return this.notifications.delete(id);
  }

  async deleteAllNotifications(userId: number): Promise<boolean> {
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