import { useState, useEffect } from 'react';
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
  type: 'email_verification' | 'push_event' | 'slack_message_sent' | 'slack_delivery_failed' | 'openrouter_error' | 'budget_alert' | 'low_credits' | 'no_credits' | 'incident_alert';
  title?: string;
  message: string;
  metadata?: string | NotificationMetadata; // Can be JSON string or parsed object
  createdAt: string;
  isRead: boolean;
}

interface NotificationsResponse {
  count: number;
  notifications: Notification[];
}

const fetchNotifications = async (): Promise<NotificationsResponse> => {
  const response = await apiRequest("GET", "/api/notifications/all?limit=200");
  return response.json();
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const queryClient = useQueryClient();

  // Fetch notifications; NotificationSSE invalidates when SSE delivers. Poll every 30s as fallback
  // (SSE can miss when broadcast fails, e.g. multi-tab or session mismatch).
  const { data: initialData, refetch: refetchNotifications } = useQuery<NotificationsResponse>({
    queryKey: ['/api/notifications/all'],
    queryFn: fetchNotifications,
    enabled: true,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (initialData) {
      setNotifications(initialData.notifications);
      setUnreadCount(initialData.count);
    }
  }, [initialData]);

  const markAllAsRead = async () => {
    try {
      // Optimistically update local state first to ensure UI is updated immediately
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      
      // Mark all notifications as read in database
      await apiRequest("POST", "/api/notifications/mark-read");
      
      // Refetch notifications to ensure sync with server
      await queryClient.refetchQueries({ queryKey: ['/api/notifications/all'] });
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      // On error, refetch to restore correct state
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
    }
  };

  const readNotification = async (notificationId: string | number) => {
    try {
      const response = await apiRequest("POST", `/api/notifications/mark-read/${notificationId}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error('Failed to mark notification as read');
      }
      
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      // Refetch to ensure sync with server
      await queryClient.refetchQueries({ queryKey: ['/api/notifications/all'] });
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      // On error, invalidate queries to restore correct state
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
    }
  };

  const removeNotification = async (notificationId: string | number) => {
    try {
      const res = await apiRequest("DELETE", `/api/notifications/delete/${notificationId}`);
      if (!res.ok) throw new Error('Delete failed');
      setNotifications(prev => prev.filter(n => String(n.id) !== String(notificationId)));
      setUnreadCount(prev => Math.max(0, prev - 1));
      await queryClient.refetchQueries({ queryKey: ['/api/notifications/all'] });
    } catch (error) {
      console.error('Error removing notification:', error);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
    }
  };

  const clearAllNotifications = async () => {
    try {
      const res = await apiRequest("DELETE", "/api/notifications/clear-all");
      if (!res.ok) throw new Error('Clear all failed');
      setNotifications([]);
      setUnreadCount(0);
      await queryClient.refetchQueries({ queryKey: ['/api/notifications/all'] });
    } catch (error) {
      console.error('❌ Error clearing notifications:', error);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
    }
  };

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