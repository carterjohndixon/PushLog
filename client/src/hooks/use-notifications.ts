import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface Notification {
  id: string;
  type: 'email_verification' | 'push_event';
  message: string;
  createdAt: string;
}

interface NotificationsResponse {
  count: number;
  notifications: Notification[];
}

const fetchNotifications = async (): Promise<NotificationsResponse> => {
  const response = await apiRequest("GET", "/api/notifications/unread");
  return response.json();
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [count, setCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  // Initial fetch of notifications
  const { data: initialData } = useQuery<NotificationsResponse>({
    queryKey: ['/api/notifications/unread'],
    queryFn: fetchNotifications,
    enabled: true,
    refetchInterval: false, // Disable polling since we're using SSE
  });

  useEffect(() => {
    // Initialize with fetched data
    if (initialData) {
      setNotifications(initialData.notifications);
      setCount(initialData.count);
    }
  }, [initialData]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Create EventSource for real-time notifications
    const eventSource = new EventSource(`/api/notifications/stream?token=${token}`);

    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'notification') {
          // Add new notification to the list
          setNotifications(prev => [data.data, ...prev]);
          setCount(prev => prev + 1);
          
          // Invalidate the notifications query to keep it in sync
          queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      }, 5000);
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [queryClient]);

  return {
    notifications,
    count,
    hasUnread: count > 0
  };
} 