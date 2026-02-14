"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";

/**
 * Connects to the notifications SSE stream when the user is logged in.
 * Mounted at App level so real-time notifications (including incident toasts)
 * work on any page, not only those with the Header.
 */
export function NotificationSSE() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  const { data: profileResponse } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    retry: false,
    staleTime: 30_000,
  });
  const user = profileResponse?.user ?? null;

  useEffect(() => {
    if (!user) return;

    const eventSource = new EventSource("/api/notifications/stream");
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "error") return;
        if (data.type === "heartbeat" || data.type === "connected") return;

        if (data.type === "notification") {
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/all"] });
          const notifType = data.data?.type;
          if (notifType === "incident_alert") {
            window.dispatchEvent(
              new CustomEvent("incident-notification", { detail: data.data }),
            );
          } else if (notifType === "low_credits" || notifType === "no_credits") {
            window.dispatchEvent(
              new CustomEvent("credit-notification", { detail: data.data }),
            );
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setTimeout(() => {
          if (eventSourceRef.current === eventSource) {
            eventSourceRef.current = null;
            // Reconnect on next effect run if still mounted & logged in
            queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
          }
        }, 5000);
      }
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [user?.id, queryClient]);

  return null;
}
