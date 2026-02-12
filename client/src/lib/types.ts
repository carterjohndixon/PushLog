export interface DashboardStats {
  activeIntegrations: number;
  totalRepositories: number;
  dailyPushes: number;
  totalNotifications: number;
}

export interface RecentPushEvent {
  id: string;
  repositoryName: string;
  branch: string;
  commitMessage: string;
  author: string;
  timeAgo: string;
  status: 'success' | 'pending' | 'error';
}

export interface ActiveIntegration {
  id: string;
  repositoryId: string;
  repositoryName: string;
  slackChannelName: string;
  status: 'active' | 'paused' | 'error';
  lastActivity?: string;
  notificationLevel: string;
  includeCommitSummaries: boolean;
  isActive: boolean;
}

export interface RepositoryCardData {
  id?: string;
  githubId: string;
  name: string;
  fullName: string;
  owner: string;
  branch: string;
  isActive: boolean;
  isConnected: boolean;
  private: boolean;
  lastPush?: string;
  totalPushes?: number;
  slackChannel?: string;
  integrationCount?: number;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

export interface IntegrationFormData {
  repositoryId: string;
  slackChannelId: string;
  slackChannelName: string;
  notificationLevel: 'all' | 'main_only' | 'tagged_only';
  includeCommitSummaries: boolean;
}
