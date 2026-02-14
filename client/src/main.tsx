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
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    ],
    enableLogs: true,
  });
  // Verification: add ?sentry_test=1 to URL to send a test event. captureMessage → Issues; logger.info → Explore > Logs.
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("sentry_test") === "1") {
    Sentry.captureMessage("PushLog Sentry test", "info");
    Sentry.logger.info("User triggered test log", { log_source: "sentry_test" });
  }
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);