import * as React from "react";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("no window"));
      return;
    }
    if (window.turnstile) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]');
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Turnstile script failed to load")),
        { once: true },
      );
      return;
    }
    const s = document.createElement("script");
    s.src = TURNSTILE_SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(s);
  });
}

export interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string | null) => void;
  className?: string;
}

/**
 * Cloudflare Turnstile (explicit render). Parent should send `token` with login/signup JSON as `turnstileToken`.
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */
export function TurnstileWidget({ siteKey, onToken, className }: TurnstileWidgetProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const widgetIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    const run = async () => {
      try {
        await loadTurnstileScript();
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
          theme: "auto",
        });
      } catch {
        onToken(null);
      }
    };

    void run();

    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (id && window.turnstile?.remove) {
        try {
          window.turnstile.remove(id);
        } catch {
          // ignore
        }
      }
    };
  }, [siteKey, onToken]);

  return <div ref={containerRef} className={className} data-testid="turnstile-widget" />;
}
