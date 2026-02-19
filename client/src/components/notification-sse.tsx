"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";

/**
 * Fires the incident toast custom event + browser notification for an
 * incident_alert payload.  Shared by the SSE path and the polling fallback.
 */
function dispatchIncidentAlert(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent("incident-notification", { detail }),
  );
  const title = (detail.title as string) ?? "Incident";
  const body = (detail.message as string) ?? "New incident detected";
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/images/PushLog-06p_njbF.png",
        tag: "pushlog-incident",
      });
    } catch {
      // ignore
    }
  }
}

/**
 * Connects to the notifications SSE stream when the user is logged in.
 * Mounted at App level so real-time notifications (including incident toasts)
 * work on any page, not only those with the Header.
 *
 * Also polls /api/notifications/all every 15 s as a fallback — if a new unread
 * incident_alert appears that the SSE path missed, the toast + browser
 * notification still fire.
 */
export function NotificationSSE() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastSeenIncidentIdRef = useRef<string | null>(null);

  const { data: profileResponse } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    retry: false,
    staleTime: 30_000,
  });
  const user = profileResponse?.user ?? null;

  // Polling fallback: detect new incident_alert notifications from API
  const checkForNewIncidents = useCallback(
    (notifications: Array<Record<string, unknown>> | undefined) => {
      if (!notifications || notifications.length === 0) return;
      const newest = notifications.find(
        (n) => n.type === "incident_alert" && !n.isRead,
      );
      if (!newest) return;
      const id = String(newest.id ?? "");
      if (!id || id === lastSeenIncidentIdRef.current) return;
      lastSeenIncidentIdRef.current = id;
      dispatchIncidentAlert(newest);
      // Ensure the notifications dropdown/list refreshes (SSE may have missed)
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/all"] });
    },
    [queryClient],
  );

  // Poll notifications every 15 s as belt-and-suspenders fallback
  const { data: polledNotifs } = useQuery<{ notifications: Array<Record<string, unknown>> }>({
    queryKey: ["/api/notifications/all"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/all", { credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 15_000,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    checkForNewIncidents(polledNotifs?.notifications);
  }, [polledNotifs, checkForNewIncidents]);

  // SSE real-time path
  useEffect(() => {
    if (!user) return;

    const eventSource = new EventSource("/api/notifications/stream");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("[NotificationSSE] connected");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "error") return;
        if (data.type === "heartbeat" || data.type === "connected") return;

        if (data.type === "notification") {
          console.log("[NotificationSSE] notification received:", data.data?.type, data.data?.title);
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/all"] });
          const notifType = data.data?.type;
          if (notifType === "incident_alert") {
            console.log("[NotificationSSE] incident_alert — dispatching toast + browser notif");
            lastSeenIncidentIdRef.current = String(data.data?.id ?? "");
            dispatchIncidentAlert(data.data);
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
      console.warn("[NotificationSSE] SSE error / disconnected, readyState:", eventSource.readyState);
      if (eventSource.readyState === EventSource.CLOSED) {
        setTimeout(() => {
          if (eventSourceRef.current === eventSource) {
            eventSourceRef.current = null;
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
