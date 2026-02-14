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

export function IncidentToast() {
  const [incident, setIncident] = useState<IncidentNotification | null>(null);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handle = (e: CustomEvent<IncidentNotification>) => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);

      const data = e.detail;
      setIncident(data);
      setExiting(false);
      setVisible(false); // Start off-screen for slide-in

      // Trigger slide-in after a frame so transition runs
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });

      dismissTimer.current = setTimeout(() => {
        setExiting(true);
        exitTimer.current = setTimeout(() => {
          setVisible(false);
          setIncident(null);
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
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setIncident(null);
    }, 300);
  };

  const viewDetails = () => {
    if (!incident) return;
    window.dispatchEvent(
      new CustomEvent("show-notification-modal", { detail: { id: incident.id } })
    );
    dismiss();
  };

  if (!incident) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-[90] w-[360px] max-w-[calc(100vw-2rem)] transition-transform duration-300 ease-out",
        visible && !exiting ? "translate-x-0 opacity-100" : "translate-x-[calc(100%+2rem)] opacity-0"
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
            <p className="font-semibold text-foreground">{incident.title}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {incident.message}
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
