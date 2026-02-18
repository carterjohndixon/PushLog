"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IncidentNotification {
  id: string | number;
  type: "incident_alert";
  title: string;
  message: string;
  metadata?: Record<string, unknown> | string;
  createdAt: string;
  isRead?: boolean;
}

const AUTO_DISMISS_MS = 12_000;
const EXIT_DURATION_MS = 300;

interface ToastState {
  incident: IncidentNotification | null;
  visible: boolean;
  exiting: boolean;
}

const INITIAL_STATE: ToastState = { incident: null, visible: false, exiting: false };

export function IncidentToast() {
  const [state, setState] = useState<ToastState>(INITIAL_STATE);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShownId = useRef<string | null>(null);

  useEffect(() => {
    const handle = (e: CustomEvent<IncidentNotification>) => {
      const data = e.detail;
      if (!data || !data.title) return;
      const idStr = String(data.id ?? data.createdAt ?? Date.now());
      if (lastShownId.current === idStr) return;
      lastShownId.current = idStr;
      const payload: IncidentNotification = {
        id: data.id ?? idStr,
        type: "incident_alert",
        title: data.title,
        message: data.message ?? "New incident",
        metadata: data.metadata,
        createdAt: data.createdAt ?? new Date().toISOString(),
        isRead: data.isRead,
      };

      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      setState({ incident: payload, visible: false, exiting: false });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => setState(s => ({ ...s, visible: true })));
      });

      dismissTimer.current = setTimeout(() => {
        setState(s => ({ ...s, exiting: true }));
        exitTimer.current = setTimeout(() => {
          setState(INITIAL_STATE);
          lastShownId.current = null;
          dismissTimer.current = null;
          exitTimer.current = null;
        }, EXIT_DURATION_MS);
      }, AUTO_DISMISS_MS);
    };

    window.addEventListener("incident-notification", handle as EventListener);
    return () => {
      window.removeEventListener("incident-notification", handle as EventListener);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, []);

  const dismiss = () => {
    setState(s => ({ ...s, exiting: true }));
    setTimeout(() => {
      setState(INITIAL_STATE);
    }, EXIT_DURATION_MS);
  };

  const viewDetails = () => {
    if (!state.incident) return;
    window.dispatchEvent(
      new CustomEvent("show-notification-modal", { detail: { id: state.incident.id, notification: state.incident } })
    );
    dismiss();
  };

  if (!state.incident) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-[9999] w-[360px] max-w-[calc(100vw-2rem)]",
        "transition-all duration-300 ease-out",
        state.visible && !state.exiting
          ? "translate-x-0 opacity-100"
          : "translate-x-[calc(100%+2rem)] opacity-0 pointer-events-none"
      )}
      aria-live="assertive"
      role="alert"
    >
      <div className="rounded-xl border-2 border-amber-500/60 bg-card shadow-xl dark:border-amber-400/50 dark:bg-card/95">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{state.incident.title}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {state.incident.message}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
                onClick={viewDetails}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                View details
              </Button>
              <Button variant="ghost" size="sm" onClick={dismiss}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Dismiss
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
