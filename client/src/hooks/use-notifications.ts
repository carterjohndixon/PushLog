import { useState, useEffect, useRef } from 'react';
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
  id: number;
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
  const response = await apiRequest("GET", "/api/notifications/all");
  return response.json();
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();
  const [currentToken, setCurrentToken] = useState<string | null>(null);

  // Fetch notifications from database
  const { data: initialData, refetch: refetchNotifications } = useQuery<NotificationsResponse>({
    queryKey: ['/api/notifications/all'],
    queryFn: fetchNotifications,
    enabled: true,
    refetchInterval: false, // Disable polling since we're using SSE
  });

  useEffect(() => {
    if (initialData) {
      setNotifications(initialData.notifications);
      setUnreadCount(initialData.count);
    }
  }, [initialData]);

  useEffect(() => {
    // Create EventSource for real-time notifications
    const eventSource = new EventSource(`/api/notifications/stream`);

    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle error messages from server (e.g., auth failures)
        if (data.type === 'error') {
          console.warn('SSE error message:', data.message);
          // Don't redirect here - let ProtectedRoute handle auth redirects
          // Just close the connection gracefully
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          return;
        }
        
        if (data.type === 'notification') {
          // Add new notification to the list
          setNotifications(prev => [data.data, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          // Handle credit-related notifications with toast
          if (data.data.type === 'low_credits' || data.data.type === 'no_credits') {
            const creditEvent = new CustomEvent('credit-notification', { detail: data.data });
            window.dispatchEvent(creditEvent);
          }
          
          // Dispatch for incident toast (slide-in notification)
          if (data.data.type === 'incident_alert') {
            window.dispatchEvent(new CustomEvent('incident-notification', { detail: data.data }));
          }
          
          // Invalidate the query to refetch from database
          queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
        }
        
        // Ignore heartbeat messages (they're just keep-alive)
        if (data.type === 'heartbeat' || data.type === 'connected') {
          // Connection is healthy, do nothing
          return;
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      
      // SSE connections can fail for many reasons (network, server restart, etc.)
      // Don't immediately redirect - only redirect if we're certain it's an auth issue
      // Let ProtectedRoute handle auth redirects - SSE failures are not necessarily auth failures
      
      if (eventSource.readyState === EventSource.CLOSED) {
        // Connection closed - try to reconnect after a delay
        // Don't redirect immediately - network issues are common
        setTimeout(() => {
          // Check if component is still mounted and we should reconnect
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
            
            // Try to create a new connection
            // Browser will automatically send cookie if session is still valid
            try {
              const newEventSource = new EventSource(`/api/notifications/stream`);
              
              // Set up message handler
              newEventSource.onmessage = eventSource.onmessage;
              
              newEventSource.onerror = (reconnectError) => {
                console.error('SSE reconnect failed:', reconnectError);
                // Don't redirect on reconnect failure - let ProtectedRoute handle auth
                // SSE failures can be due to network issues, not just auth
                // If session is expired, ProtectedRoute will catch it on the next page load
                if (newEventSource.readyState === EventSource.CLOSED) {
                  // Connection closed - just log, don't redirect
                  // The user can still use the app, they just won't get real-time notifications
                  console.warn('SSE connection closed. Real-time notifications disabled. User can still use the app.');
                }
              };
              
              eventSourceRef.current = newEventSource;
            } catch (reconnectError) {
              console.error('Failed to create new SSE connection:', reconnectError);
              // Don't redirect - this could be a network issue
              // ProtectedRoute will handle auth redirects if needed
            }
          }
        }, 5000); // Wait 5 seconds before reconnecting
      }
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [queryClient, currentToken]);

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

  const readNotification = async (notificationId: number) => {
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

  const removeNotification = async (notificationId: number) => {
    try {
      await apiRequest("DELETE", `/api/notifications/delete/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error removing notification:', error);
    }
  };

  const clearAllNotifications = async () => {
    try {
      await apiRequest("DELETE", "/api/notifications/clear-all");
      setNotifications([]);
      setUnreadCount(0);
      await queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
      const verifyResponse = await apiRequest("GET", "/api/notifications/all");
      const verifyData = await verifyResponse.json();
      setNotifications(verifyData.notifications || []);
      setUnreadCount(verifyData.count || 0);
    } catch (error) {
      console.error('❌ Error clearing notifications:', error);
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