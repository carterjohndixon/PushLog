import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface Notification {
  id: number;
  type: 'email_verification' | 'push_event' | 'slack_message_sent';
  title?: string;
  message: string;
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
  const { data: initialData } = useQuery<NotificationsResponse>({
    queryKey: ['/api/notifications/all'],
    queryFn: fetchNotifications,
    enabled: true,
    refetchInterval: false, // Disable polling since we're using SSE
  });

  useEffect(() => {
    // Initialize with fetched data
    if (initialData) {
      setNotifications(initialData.notifications);
      setUnreadCount(initialData.count);
    }
  }, [initialData]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Force refresh notifications when token changes (e.g., after email verification)
    if (token !== currentToken) {
      setCurrentToken(token);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
    }

    // Create EventSource for real-time notifications
    const eventSource = new EventSource(`/api/notifications/stream?token=${token}`);

    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'notification') {
          // Add new notification to the list
          setNotifications(prev => [data.data, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          // Invalidate the query to refetch from database
          queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      
      // Check if the error is due to token expiration
      if (eventSource.readyState === EventSource.CLOSED) {
        // Try to reconnect, but if it fails due to auth, redirect to login
        setTimeout(() => {
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
            
            // Check if token still exists and is valid
            const token = localStorage.getItem('token');
            if (!token) {
              console.log('No token found, redirecting to login');
              window.location.href = '/login';
              return;
            }
            
            // Try to create a new connection
            try {
              const newEventSource = new EventSource(`/api/notifications/stream?token=${token}`);
              newEventSource.onerror = (reconnectError) => {
                console.error('SSE reconnect failed:', reconnectError);
                // If reconnect fails, assume token is expired
                localStorage.removeItem('token');
                window.location.href = '/login';
              };
              eventSourceRef.current = newEventSource;
            } catch (reconnectError) {
              console.error('Failed to create new SSE connection:', reconnectError);
              localStorage.removeItem('token');
              window.location.href = '/login';
            }
          }
        }, 5000);
      }
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [queryClient, currentToken]);

  const markAsViewed = async () => {
    try {
      // Mark all notifications as read in database
      await apiRequest("POST", "/api/notifications/mark-read");
      setUnreadCount(0);
      // Refetch notifications to update the read status
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  const removeNotification = async (notificationId: number) => {
    try {
      await apiRequest("DELETE", `/api/notifications/${notificationId}`);
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
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  };

  return {
    notifications,
    count: unreadCount,
    hasUnread: unreadCount > 0,
    markAsViewed,
    removeNotification,
    clearAllNotifications
  };
} 