export interface DashboardStats {
  activeIntegrations: number;
  totalRepositories: number;
  dailyPushes: number;
  totalNotifications: number;
}

export interface RecentPushEvent {
  id: number;
  repositoryName: string;
  branch: string;
  commitMessage: string;
  author: string;
  timeAgo: string;
  status: 'success' | 'pending' | 'error';
}

export interface ActiveIntegration {
  id: number;
  repositoryId: number;
  repositoryName: string;
  slackChannelName: string;
  status: 'active' | 'paused' | 'error';
  lastActivity?: string;
  notificationLevel: string;
  includeCommitSummaries: boolean;
  isActive: boolean;
}

export interface RepositoryCardData {
  id?: number;
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
  repositoryId: number;
  slackChannelId: string;
  slackChannelName: string;
  notificationLevel: 'all' | 'main_only' | 'tagged_only';
  includeCommitSummaries: boolean;
}
