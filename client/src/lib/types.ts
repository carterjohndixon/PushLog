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
  /** ISO date of latest push to this integration's repo (for sorting by recent activity). */
  lastUsed?: string | null;
  lastActivity?: string;
  notificationLevel: string;
  includeCommitSummaries: boolean;
  isActive: boolean;
  /** Optional; present when integration is loaded with settings (e.g. for modal). */
  aiModel?: string;
  maxTokens?: number;
  hasOpenRouterKey?: boolean;
  /** Set to null/empty when Slack workspace was disconnected; unpause requires reconnecting Slack. */
  slackWorkspaceId?: string | null;
  slackChannelId?: string | null;
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
  monitorAllBranches?: boolean;
  /** Path prefixes for incident correlation (e.g. ["src/auth", "src/payments"]). */
  criticalPaths?: string[] | null;
  /** Optional Sentry/service name for multi-repo correlation. */
  incidentServiceName?: string | null;
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
