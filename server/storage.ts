import { 
  users, repositories, integrations, pushEvents, slackWorkspaces, notifications,
  type User, type InsertUser,
  type Repository, type InsertRepository,
  type Integration, type InsertIntegration,
  type PushEvent, type InsertPushEvent,
  type SlackWorkspace, type InsertSlackWorkspace,
  type Notification, type InsertNotification
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
  getIntegrationByRepositoryId(repositoryId: number): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: number, updates: Partial<Integration>): Promise<Integration | undefined>;
  deleteIntegration(id: number): Promise<boolean>;

  // Push event methods
  getPushEvent(id: number): Promise<PushEvent | undefined>;
  getPushEventsByRepositoryId(repositoryId: number): Promise<PushEvent[]>;
  createPushEvent(pushEvent: InsertPushEvent): Promise<PushEvent>;
  updatePushEvent(id: number, updates: Partial<PushEvent>): Promise<PushEvent | undefined>;

  // Slack workspace methods
  getSlackWorkspace(id: number): Promise<SlackWorkspace | undefined>;
  getSlackWorkspacesByUserId(userId: number): Promise<SlackWorkspace[]>;
  getSlackWorkspaceByTeamId(teamId: string): Promise<SlackWorkspace | undefined>;
  createSlackWorkspace(workspace: InsertSlackWorkspace): Promise<SlackWorkspace>;
  updateSlackWorkspace(id: number, updates: Partial<SlackWorkspace>): Promise<SlackWorkspace | undefined>;

  // Analytics methods
  getStatsForUser(userId: number): Promise<{
    activeIntegrations: number;
    totalRepositories: number;
    dailyPushes: number;
    totalNotifications: number;
  }>;

  // Notification methods
  getNotificationsByUserId(userId: number): Promise<Notification[]>;
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
    console.log('Creating user with ID:', id);
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
    console.log('Created user:', user);
    console.log('Current users in storage:', Array.from(this.users.entries()));
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

  async getIntegrationByRepositoryId(repositoryId: number): Promise<Integration | undefined> {
    return Array.from(this.integrations.values()).find(integration => integration.repositoryId === repositoryId);
  }

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const id = this.currentIntegrationId++;
    const newIntegration: Integration = {
      ...integration,
      id,
      isActive: integration.isActive ?? null,
      notificationLevel: integration.notificationLevel || null,
      includeCommitSummaries: integration.includeCommitSummaries ?? null,
      createdAt: new Date().toISOString()
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

  async getPushEventsByRepositoryId(repositoryId: number): Promise<PushEvent[]> {
    return Array.from(this.pushEvents.values())
      .filter(event => event.repositoryId === repositoryId)
      .sort((a, b) => b.pushedAt.getTime() - a.pushedAt.getTime());
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
      createdAt: new Date().toISOString()
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
    const allPushEvents = Array.from(this.pushEvents.values());
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

  // Notification methods
  async getNotificationsByUserId(userId: number): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
