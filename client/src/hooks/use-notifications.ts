import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface Notification {
  id: number;
  type: 'email_verification' | 'push_event' | 'slack_message_sent' | 'low_credits' | 'no_credits';
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
    // Create EventSource for real-time notifications
    const eventSource = new EventSource(`/api/notifications/stream`);

    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'notification') {
          // Add new notification to the list
          setNotifications(prev => [data.data, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          // Handle credit-related notifications with toast
          if (data.data.type === 'low_credits' || data.data.type === 'no_credits') {
            // Dispatch custom event for credit notifications
            const creditEvent = new CustomEvent('credit-notification', {
              detail: data.data
            });
            window.dispatchEvent(creditEvent);
          }
          
          // Invalidate the query to refetch from database
          queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      
            // Check if the error is due to session expiration
            if (eventSource.readyState === EventSource.CLOSED) {
              // Try to reconnect, but if it fails due to auth, redirect to login
              setTimeout(() => {
                if (eventSourceRef.current) {
                  eventSourceRef.current.close();
                  eventSourceRef.current = null;
                  
                  // Try to create a new connection
                  // Browser will automatically send cookie if session is still valid
                  try {
                    const newEventSource = new EventSource(`/api/notifications/stream`);
                    newEventSource.onerror = (reconnectError) => {
                      console.error('SSE reconnect failed:', reconnectError);
                      // If reconnect fails, assume session is expired
                      // Server will return 401, client will handle redirect
                      if (newEventSource.readyState === EventSource.CLOSED) {
                        window.location.href = '/login';
                      }
                    };
                    eventSourceRef.current = newEventSource;
                  } catch (reconnectError) {
                    console.error('Failed to create new SSE connection:', reconnectError);
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
      // Optimistically update local state first
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
      console.log('🗑️ Starting to clear all notifications...');
      console.log('📊 Current notifications count:', notifications.length);
      console.log('📊 Current unread count:', unreadCount);
      
      // Make the API request to clear all notifications
      const response = await apiRequest("DELETE", "/api/notifications/clear-all");
      console.log('✅ API request successful, response:', response);
      
      // Update local state immediately
      setNotifications([]);
      setUnreadCount(0);
      console.log('🔄 Local state updated - notifications cleared');
      
      // Force a refetch to ensure UI is in sync with server
      await queryClient.invalidateQueries({ queryKey: ['/api/notifications/all'] });
      console.log('🔄 Query cache invalidated');
      
      // Refetch to verify the clear worked
      const verifyResponse = await apiRequest("GET", "/api/notifications/all");
      const verifyData = await verifyResponse.json();
      console.log('🔍 Verification fetch result:', verifyData);
      
      setNotifications(verifyData.notifications || []);
      setUnreadCount(verifyData.count || 0);
      console.log('✅ Clear all notifications completed successfully');
    } catch (error) {
      console.error('❌ Error clearing notifications:', error);
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