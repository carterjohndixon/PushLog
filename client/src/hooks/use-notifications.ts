import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface NotificationMetadata {
  pushEventId?: number;
  repositoryId?: number;
  repositoryName?: string;
  repositoryFullName?: string;
  branch?: string;
  commitSha?: string;
  commitMessage?: string;
  author?: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
  aiGenerated?: boolean;
  aiModel?: string | null;
  aiSummary?: string | null;
  aiImpact?: string | null;
  aiCategory?: string | null;
  slackChannelId?: string;
  slackChannelName?: string;
  slackWorkspaceId?: number;
  integrationId?: number;
  pushedAt?: string;
}

interface Notification {
  id: string | number;
  type: 'email_verification' | 'push_event' | 'slack_message_sent' | 'slack_delivery_failed' | 'openrouter_error' | 'budget_alert' | 'low_credits' | 'no_credits' | 'incident_alert' | 'member_joined';
  title?: string;
  message: string;
  metadata?: string | NotificationMetadata;
  createdAt: string;
  isRead: boolean;
}

interface NotificationsResponse {
  count: number;
  notifications: Notification[];
}

const QUERY_KEY = ['/api/notifications/all'] as const;

const fetchNotifications = async (): Promise<NotificationsResponse> => {
  const response = await apiRequest("GET", "/api/notifications/all?limit=200");
  return response.json();
};

export function useNotifications() {
  const queryClient = useQueryClient();

  const { data, refetch: refetchNotifications } = useQuery<NotificationsResponse>({
    queryKey: QUERY_KEY,
    queryFn: fetchNotifications,
    enabled: true,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.count ?? 0;

  const optimisticUpdate = useCallback(
    (updater: (prev: NotificationsResponse | undefined) => NotificationsResponse | undefined) => {
      queryClient.setQueryData<NotificationsResponse>(QUERY_KEY, updater);
    },
    [queryClient],
  );

  const markAllAsRead = useCallback(async () => {
    try {
      optimisticUpdate((prev) =>
        prev ? { ...prev, count: 0, notifications: prev.notifications.map((n) => ({ ...n, isRead: true })) } : prev,
      );
      await apiRequest("POST", "/api/notifications/mark-read");
      await queryClient.refetchQueries({ queryKey: QUERY_KEY });
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }
  }, [queryClient, optimisticUpdate]);

  const readNotification = useCallback(async (notificationId: string | number) => {
    try {
      optimisticUpdate((prev) =>
        prev
          ? {
              ...prev,
              count: Math.max(0, prev.count - (prev.notifications.find((n) => n.id === notificationId && !n.isRead) ? 1 : 0)),
              notifications: prev.notifications.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
            }
          : prev,
      );
      const response = await apiRequest("POST", `/api/notifications/mark-read/${notificationId}`);
      const result = await response.json();
      if (!result.success) throw new Error('Failed to mark notification as read');
      await queryClient.refetchQueries({ queryKey: QUERY_KEY });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }
  }, [queryClient, optimisticUpdate]);

  const removeNotification = useCallback(async (notificationId: string | number) => {
    try {
      optimisticUpdate((prev) =>
        prev
          ? {
              ...prev,
              count: Math.max(0, prev.count - (prev.notifications.find((n) => String(n.id) === String(notificationId) && !n.isRead) ? 1 : 0)),
              notifications: prev.notifications.filter((n) => String(n.id) !== String(notificationId)),
            }
          : prev,
      );
      const res = await apiRequest("DELETE", `/api/notifications/delete/${notificationId}`);
      if (!res.ok) throw new Error('Delete failed');
      await queryClient.refetchQueries({ queryKey: QUERY_KEY });
    } catch (error) {
      console.error('Error removing notification:', error);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }
  }, [queryClient, optimisticUpdate]);

  const clearAllNotifications = useCallback(async () => {
    try {
      optimisticUpdate(() => ({ count: 0, notifications: [] }));
      const res = await apiRequest("DELETE", "/api/notifications/clear-all");
      if (!res.ok) throw new Error('Clear all failed');
      await queryClient.refetchQueries({ queryKey: QUERY_KEY });
    } catch (error) {
      console.error('Error clearing notifications:', error);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }
  }, [queryClient, optimisticUpdate]);

  return {
    notifications,
    count: unreadCount,
    hasUnread: unreadCount > 0,
    markAllAsRead,
    readNotification,
    removeNotification,
    clearAllNotifications,
    refetchNotifications,
  };
} 