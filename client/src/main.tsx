import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./lib/theme";

// Client-side Sentry (set VITE_SENTRY_DSN in env to enable)
const dsn = import.meta.env.VITE_SENTRY_DSN ?? "";
const release = import.meta.env.VITE_SENTRY_RELEASE;
if (dsn) {
  Sentry.init({
    dsn,
    tunnel: "/api/sentry/tunnel", // Proxy via our server — avoids ad-blockers
    // Must match the release used when uploading source maps (set in CI via VITE_SENTRY_RELEASE)
    ...(release && { release }),
    enableLogs: true,
    ignoreErrors: [
      // Chunk load failures during deploys — stale app requests old chunk URLs; we auto-reload
      /Failed to fetch dynamically imported module/,
      /Loading chunk [\d]+ failed/,
      /Loading CSS chunk [\d]+ failed/,
      /dynamically imported module/,
      /Importing a module script failed/,
    ],
    beforeSend(event, hint) {
      const msg = (hint?.originalException as Error)?.message ?? event.message ?? "";
      if (
        msg.includes("dynamically imported module") ||
        msg.includes("Loading chunk") ||
        msg.includes("Loading CSS chunk") ||
        msg.includes("Importing a module script failed")
      ) {
        return null; // drop event — deploy stale chunk; user will reload
      }
      return event;
    },
  });
  // Debug: on staging, open console and type __SENTRY_DEBUG__ to see what release is being sent
  if (typeof window !== "undefined") {
    (window as unknown as { __SENTRY_DEBUG__?: { release: string | undefined } }).__SENTRY_DEBUG__ = { release: release || undefined };
  }
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);