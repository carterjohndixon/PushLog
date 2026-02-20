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
  const seenIncidentIdsRef = useRef<Set<string>>(new Set());
  const hasSeededRef = useRef(false);
  const TOAST_FRESHNESS_MS = 10 * 60 * 1000; // Only toast from poll if created in last 10 min

  const { data: profileResponse } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    retry: false,
    staleTime: 30_000,
  });
  const user = profileResponse?.user ?? null;

  // Polling fallback: only toast for NEW incidents (not ones that existed on load)
  const checkForNewIncidents = useCallback(
    (notifications: Array<Record<string, unknown>> | undefined) => {
      if (!notifications || notifications.length === 0) return;
      const unreadIncidents = notifications.filter(
        (n) => n.type === "incident_alert" && !n.isRead,
      );
      if (unreadIncidents.length === 0) return;

      // First load: seed "seen" with all current unread incident IDs — do NOT toast
      if (!hasSeededRef.current) {
        hasSeededRef.current = true;
        for (const n of unreadIncidents) {
          const id = String(n.id ?? "");
          if (id) seenIncidentIdsRef.current.add(id);
        }
        return;
      }

      // Subsequent polls: only toast for IDs we haven't seen, and only if created recently
      for (const n of unreadIncidents) {
        const id = String(n.id ?? "");
        if (!id || seenIncidentIdsRef.current.has(id)) continue;
        const createdAt = n.createdAt ? new Date(String(n.createdAt)).getTime() : 0;
        if (Date.now() - createdAt > TOAST_FRESHNESS_MS) continue;
        seenIncidentIdsRef.current.add(id);
        dispatchIncidentAlert(n);
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/all"] });
        break;
      }
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
            const id = String(data.data?.id ?? "");
            if (id) seenIncidentIdsRef.current.add(id);
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

  // Reset seen state when user changes so we reseed on next load (avoids toasting
  // User B's pre-existing notifications after User A logs out, or re-toasting on re-login)
  const prevUserIdRef = useRef<string | number | null>(null);
  if (prevUserIdRef.current !== (user?.id ?? null)) {
    prevUserIdRef.current = user?.id ?? null;
    seenIncidentIdsRef.current = new Set();
    hasSeededRef.current = false;
  }

  return null;
}
