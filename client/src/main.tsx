import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./lib/theme";

// Client-side Sentry (set VITE_SENTRY_DSN to override or disable)
const dsn = import.meta.env.VITE_SENTRY_DSN ?? "https://76dff591029ab7f40572c74af67aa470@o4510881753137152.ingest.us.sentry.io/4510881854521344";
if (dsn) {
  Sentry.init({
    dsn,
    tunnel: "/api/sentry/tunnel", // Proxy via our server — avoids ad-blockers
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
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);