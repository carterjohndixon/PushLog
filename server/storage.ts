import { 
  users, repositories, integrations, pushEvents, slackWorkspaces,
  type User, type InsertUser,
  type Repository, type InsertRepository,
  type Integration, type InsertIntegration,
  type PushEvent, type InsertPushEvent,
  type SlackWorkspace, type InsertSlackWorkspace
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGithubId(githubId: string): Promise<User | undefined>;
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
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private repositories: Map<number, Repository> = new Map();
  private integrations: Map<number, Integration> = new Map();
  private pushEvents: Map<number, PushEvent> = new Map();
  private slackWorkspaces: Map<number, SlackWorkspace> = new Map();
  private currentUserId = 1;
  private currentRepositoryId = 1;
  private currentIntegrationId = 1;
  private currentPushEventId = 1;
  private currentSlackWorkspaceId = 1;

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByGithubId(githubId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.githubId === githubId);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { 
      ...insertUser, 
      id, 
      githubId: null,
      githubToken: null,
      slackUserId: null,
      createdAt: new Date()
    };
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

  async createRepository(insertRepository: InsertRepository): Promise<Repository> {
    const id = this.currentRepositoryId++;
    const repository: Repository = { 
      ...insertRepository, 
      id,
      branch: insertRepository.branch || "main",
      isActive: insertRepository.isActive ?? true,
      webhookId: insertRepository.webhookId || null,
      createdAt: new Date()
    };
    this.repositories.set(id, repository);
    return repository;
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

  async createIntegration(insertIntegration: InsertIntegration): Promise<Integration> {
    const id = this.currentIntegrationId++;
    const integration: Integration = { 
      ...insertIntegration, 
      id,
      notificationLevel: insertIntegration.notificationLevel || "all",
      includeCommitSummaries: insertIntegration.includeCommitSummaries ?? true,
      isActive: insertIntegration.isActive ?? true,
      createdAt: new Date()
    };
    this.integrations.set(id, integration);
    return integration;
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

  async createPushEvent(insertPushEvent: InsertPushEvent): Promise<PushEvent> {
    const id = this.currentPushEventId++;
    const pushEvent: PushEvent = { 
      ...insertPushEvent, 
      id,
      notificationSent: insertPushEvent.notificationSent ?? false,
      createdAt: new Date()
    };
    this.pushEvents.set(id, pushEvent);
    return pushEvent;
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

  async createSlackWorkspace(insertSlackWorkspace: InsertSlackWorkspace): Promise<SlackWorkspace> {
    const id = this.currentSlackWorkspaceId++;
    const slackWorkspace: SlackWorkspace = { 
      ...insertSlackWorkspace, 
      id,
      createdAt: new Date()
    };
    this.slackWorkspaces.set(id, slackWorkspace);
    return slackWorkspace;
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
}

export const storage = new MemStorage();
