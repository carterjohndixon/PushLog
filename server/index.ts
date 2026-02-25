/** Build-time: set by esbuild --define for prod/staging bundles; undefined in dev (tsx) */
declare const __APP_ENV__: string | undefined;

import dotenv from "dotenv";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import session from "express-session";
import pgSession from "connect-pg-simple";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import morgan from "morgan";
import * as Sentry from "@sentry/node";
import { registerRoutes, slackCommandsHandler, githubWebhookHandler, sentryWebhookHandler } from "./routes";
import { verifyWebhookSignature } from "./github";
import { ensureIncidentEngineStarted, stopIncidentEngine } from "./incidentEngine";
import { sendIncidentAlertEmail } from "./email";
import broadcastNotification from "./helper/broadcastNotification";
import { databaseStorage } from "./database";
import pkg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const { Pool } = pkg;

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env files from the project root (one level up from server directory).
// In production/staging: load ONLY .env.{APP_ENV} with override so the correct
// secrets are used deterministically (dotenv does not override by default).
// In development: load .env first, then .env.{APP_ENV} with override if set.
const root = path.join(__dirname, '..');
const appEnv = process.env.APP_ENV || process.env.NODE_ENV || '';

if (appEnv === 'production' || appEnv === 'staging') {
  const envPath = path.join(root, `.env.${appEnv}`);
  const result = dotenv.config({ path: envPath, override: true });
} else {
  dotenv.config({ path: path.join(root, '.env') });
  if (appEnv && appEnv !== 'development') {
    dotenv.config({ path: path.join(root, `.env.${appEnv}`), override: true });
  }
}

const _whSecret = process.env.GITHUB_WEBHOOK_SECRET || '';

const skipGitHubVerify = process.env.SKIP_GITHUB_WEBHOOK_VERIFY === "1" || process.env.SKIP_GITHUB_WEBHOOK_VERIFY === "true";
if (skipGitHubVerify) {
  console.warn("⚠️ SKIP_GITHUB_WEBHOOK_VERIFY is set - GitHub webhook signature verification is DISABLED.");
}

// Initialize Sentry for error tracking (fallback DSN matches tunnel/client — pushlog project)
const sentryDsn = process.env.SENTRY_DSN || "https://76dff591029ab7f40572c74af67aa470@o4510881753137152.ingest.us.sentry.io/4510881854521344";
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || process.env.APP_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [Sentry.expressIntegration()],
  });
}

const app = express();

// Trust proxy for ngrok and production deployments
if (process.env.NODE_ENV === 'production') {
  // In production, trust first proxy (your hosting provider)
  app.set('trust proxy', 1);
} else {
  // In development with ngrok, trust all proxies
  app.set('trust proxy', true);
}

// Create PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Configure session store
const PostgresqlStore = pgSession(session);
const sessionStore = new PostgresqlStore({
  pool,
  tableName: 'user_sessions',
  createTableIfMissing: true,  // Automatically create table if it doesn't exist
  pruneSessionInterval: false  // Disable automatic cleanup - let sessions expire naturally based on maxAge
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.github.com", "https://slack.com", "https://api.stripe.com", "https://*.ingest.sentry.io", "https://*.ingest.us.sentry.io"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      frameAncestors: ["'self'"], // Clickjacking protection (reinforces X-Frame-Options)
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// Rate limiting
const isDevelopment = process.env.NODE_ENV !== 'production';
const isLoadTesting = process.env.LOAD_TESTING === 'true';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isLoadTesting ? 10000 : (isDevelopment ? 1000 : 100), // More permissive in dev/load testing
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip validation for trust proxy - we're behind nginx which sets X-Forwarded-For correctly
  validate: {
    trustProxy: false, // Disable validation since we trust nginx
  },
  skip: (req) => {
    // IMPORTANT: this limiter is mounted on /api/, so req.path here is usually
    // '/profile' (not '/api/profile'). Normalize path, strip querystring,
    // and ignore trailing slash so polling endpoints always match.
    const path = req.path || "";
    const original = req.originalUrl || "";
    const rawApiPath = original.startsWith("/api/") ? original.slice(4) : path;
    const apiPath = rawApiPath.split("?")[0].replace(/\/+$/, "") || "/";

    // Skip rate limiting for health checks, frequent auth checks, and
    // promotion admin/status endpoints that poll frequently.
    return apiPath === "/health" ||
           apiPath === "/health/detailed" ||
           apiPath === "/profile" ||
           apiPath.startsWith("/admin/staging/status") ||
           apiPath.startsWith("/admin/staging/promote") ||
           apiPath.startsWith("/admin/staging/cancel-promote") ||
           apiPath.startsWith("/webhooks/promote-production/status") ||
           apiPath === "/webhooks/promote-production" ||
           apiPath.startsWith("/webhooks/promote-production/cancel");
  },
});
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints (per-IP; per-account lockout is in routes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isLoadTesting ? 100 : (isDevelopment ? 50 : 30), // Allow enough to trigger per-account lockout (5) + correct attempt; 30/15min per IP
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
  },
});
app.use('/api/login', authLimiter);
app.use('/api/signup', authLimiter);

// Rate limiting for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 password reset attempts per hour
  message: 'Too many password reset attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
  },
});
app.use('/api/forgot-password', passwordResetLimiter);
app.use('/api/reset-password', passwordResetLimiter);

// Rate limiting for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 payment attempts per 5 minutes
  message: 'Too many payment attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
  },
});
app.use('/api/payments/', paymentLimiter);

// AUTH-VULN-17: Prevent caching of auth responses (tokens, credentials, user data)
const AUTH_NO_CACHE_PATHS = [
  '/api/login',
  '/api/signup',
  '/api/logout',
  '/api/user',
  '/api/profile',
  '/api/forgot-password',
  '/api/reset-password',
  '/api/change-password',
  '/api/auth/user',       // OAuth callback — must never be cached or users see JSON instead of redirect
  '/api/auth/github/init',     // GitHub OAuth init — redirects to GitHub
  '/api/auth/github/exchange',  // POST exchange — fallback
  '/auth/github/callback',     // Server-side callback — Set-Cookie must reach browser
  '/api/google/user',    // Google OAuth callback
];
app.use((req, res, next) => {
  if (AUTH_NO_CACHE_PATHS.includes(req.path)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Compression
app.use(compression());

// CORS configuration
app.use(cors({
  origin: [
    'https://pushlog.ai',
    'https://staging.pushlog.ai',
  ],
  credentials: true, // Required for cookies to work
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Slack slash commands: must receive raw body for signature verification (before body parsers)
app.get("/api/slack/commands", (_req, res) => {
  res.type("text/plain").send("PushLog slash commands endpoint. Configure your Slack app Request URL to this path (POST).");
});
app.post(
  "/api/slack/commands",
  express.raw({ type: "application/x-www-form-urlencoded", limit: "1mb" }),
  slackCommandsHandler
);

// Sentry tunnel: proxy client events through our server (avoids ad-blockers blocking ingest.sentry.io)
const sentryIngestUrl = (() => {
  try {
    const match = sentryDsn.match(/^https?:\/\/[^@]+@([^/]+)\/(\d+)/);
    if (match) return `https://${match[1]}/api/${match[2]}/envelope/`;
  } catch (_) {}
  return "";
})();
if (sentryIngestUrl) {
  app.post(
    "/api/sentry/tunnel",
    express.raw({ type: () => true, limit: "1mb" }),
    async (req: express.Request, res: express.Response) => {
      try {
        const body = req.body;
        if (!body || !Buffer.isBuffer(body)) {
          res.status(400).end();
          return;
        }
        const r = await fetch(sentryIngestUrl, {
          method: "POST",
          body: new Uint8Array(body),
          headers: {
            "Content-Type": req.headers["content-type"] || "application/x-sentry-envelope",
          },
        });
        res.status(r.status).end();
      } catch (e) {
        console.warn("[sentry/tunnel] forward failed:", e);
        res.status(500).end();
      }
    }
  );
}

// GitHub webhook: must receive raw body for signature verification (before body parsers)
// type: () => true so we always get raw body even if proxy changes Content-Type
app.post(
  "/api/webhooks/github",
  express.raw({ type: () => true, limit: "1mb" }),
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const raw = req.body;
    if (!raw || !Buffer.isBuffer(raw)) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const sig = req.headers["x-hub-signature-256"] as string | undefined;
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
    if (sig) {
      if (!secret) {
        console.error("❌ GitHub webhook: GITHUB_WEBHOOK_SECRET not set");
        res.status(500).json({ error: "Webhook secret not configured" });
        return;
      }
      const skipVerify = skipGitHubVerify;
      if (skipVerify) {
        console.warn("⚠️ GitHub webhook signature verification SKIPPED (SKIP_GITHUB_WEBHOOK_VERIFY is set). Remove in production.");
      } else if (!verifyWebhookSignature(raw, sig, secret)) {
        console.error(`❌ Invalid webhook signature | bodyLength=${raw.length} secretLength=${secret.length} first6=${secret.slice(0, 6)} sigPrefix=${(sig || '').slice(0, 20)}`);
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    }
    try {
      (req as any).body = JSON.parse(raw.toString("utf8"));
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }
    next();
  },
  githubWebhookHandler
);

// Sentry webhook: must receive raw body for signature verification (Sentry signs the raw body)
app.post(
  "/api/webhooks/sentry",
  express.raw({ type: "application/json", limit: "1mb" }),
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.log("[webhooks/sentry] POST received");
    const raw = req.body;
    if (!raw || !Buffer.isBuffer(raw)) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const configuredSecret = process.env.SENTRY_WEBHOOK_SECRET?.trim();
    if (configuredSecret) {
      const sig = (req.headers["sentry-hook-signature"] as string)?.trim();
      if (!sig) {
        console.log("[webhooks/sentry] 401 Missing Sentry-Hook-Signature");
        res.status(401).json({ error: "Missing Sentry-Hook-Signature" });
        return;
      }
      const computed = crypto.createHmac("sha256", configuredSecret).update(raw).digest("hex");
      const expected = sig.startsWith("sha256=") ? "sha256=" + computed : computed;
      if (sig !== expected) {
        console.log("[webhooks/sentry] 401 Invalid signature (verify SENTRY_WEBHOOK_SECRET matches Sentry integration)");
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    }
    try {
      (req as any).body = JSON.parse(raw.toString("utf8"));
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }
    next();
  },
  sentryWebhookHandler
);

// Body parsing with security limits
app.use(express.json({ 
  limit: '1mb', // Reduced from 10mb for security
  verify: (req, res, buf) => {
    // Prevent JSON parsing attacks
    if (buf.length > 1024 * 1024) { // 1MB limit
      throw new Error('Request body too large');
    }
  }
}));
app.use(express.urlencoded({ 
  extended: false, 
  limit: '1mb' // Reduced from 10mb for security
}));

// Logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Session configuration
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET environment variable is required');
}

// When behind a proxy (e.g. staging), the app may see Host as 127.0.0.1 so the
// session cookie would be set for that host and never sent to staging.pushlog.ai.
// Set COOKIE_DOMAIN (e.g. staging.pushlog.ai) so the cookie is sent on every request.
// Production (APP_ENV=production) must never use a staging cookie domain: use pushlog.ai or no domain.
const appEnvForCookie = process.env.APP_ENV || process.env.NODE_ENV || "";
const cookieDomain =
  appEnvForCookie === "production"
    ? (process.env.COOKIE_DOMAIN === "pushlog.ai" ? "pushlog.ai" : undefined)
    : (process.env.COOKIE_DOMAIN || undefined);
// Avoid prod/staging cookie collisions (both can be sent to staging if domain scopes overlap).
// Use a distinct cookie name outside production so staging never reuses prod's connect.sid.
const sessionCookieName = appEnvForCookie === "production" ? "connect.sid" : "connect.sid.staging";

// SameSite=None required for OAuth callback: user is redirected from github.com (cross-site), so Lax
// can block the cookie from being stored. None allows it; Secure is required with None.
app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: true, // Set to true to ensure session is saved even if not modified (needed for rolling sessions)
  saveUninitialized: false,
  rolling: true, // Reset expiration on every request (keeps session alive during activity)
  name: sessionCookieName,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'none', // Required for OAuth callback from external IdP (GitHub); Lax blocks cross-site redirect cookie
    ...(cookieDomain && { domain: cookieDomain }),
  }
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (sentryDsn) Sentry.captureException(err);

    res.status(status).json({ message });
  });

  // Vite in development only; static when APP_ENV is production/staging. Uses __APP_ENV__ define
  // so esbuild can tree-shake the vite branch out of the prod bundle (vite is a devDep).
  if (typeof __APP_ENV__ === "undefined" || __APP_ENV__ === "development") {
    try {
      const { setupVite } = await import("./vite");
      await setupVite(app, server);
    } catch (error) {
      console.error("Failed to load Vite (vite may not be installed):", error);
      const { serveStatic } = await import("./vite");
      serveStatic(app);
    }
  } else {
    const { serveStatic } = await import("./static");
    serveStatic(app);
  }

  // Serve API + client on the configured app port.
  const port = Number(process.env.PORT || 5001);
  server.listen({
    port,
    host: "0.0.0.0",
    // reusePort: true,
  }, () => {
    console.log(`serving on port ${port}`);
    // Start incident engine early so it can keep warm state.
    ensureIncidentEngineStarted();
  });

  // When PushLog itself crashes (uncaughtException/unhandledRejection), send incident emails
  // only to users who have at least one repo and "Receive incident notifications" on (Settings).
  async function sendCrashEmailsToUsers(title: string, message: string, errName: string, severity: "critical" | "error") {
    try {
      const allIds = await databaseStorage.getAllUserIds();
      const userIds: string[] = [];
      for (const userId of allIds) {
        const [user, repos] = await Promise.all([
          databaseStorage.getUserById(userId),
          databaseStorage.getRepositoriesByUserId(userId),
        ]);
        if (user && (user as any).receiveIncidentNotifications !== false && repos.length > 0) {
          userIds.push(userId);
        }
      }
      const toSend: string[] = [];
      for (const userId of userIds) {
        const user = await databaseStorage.getUserById(userId);
        if (!user) continue;
        // In-app notification for every eligible user (bell + SSE)
        try {
          const notif = await databaseStorage.createNotification({
            userId,
            type: "incident_alert",
            title,
            message,
            metadata: JSON.stringify({
              service: "pushlog",
              environment: process.env.APP_ENV || process.env.NODE_ENV || "production",
              severity,
              errorMessage: message,
              exceptionType: errName,
              createdAt: new Date().toISOString(),
            }),
          });
          broadcastNotification(userId, {
            id: notif.id,
            type: notif.type,
            title: notif.title,
            message: notif.message,
            metadata: notif.metadata,
            createdAt: notif.createdAt,
            isRead: false,
          });
        } catch (e) {
          console.error("[incident] Failed to create/broadcast crash notification for user:", userId, e);
        }
        // Email only if user has incident email enabled
        if (!user.email || (user as any).incidentEmailEnabled === false) continue;
        toSend.push(user.email);
        sendIncidentAlertEmail(user.email, title, message, {
          service: "pushlog",
          environment: process.env.APP_ENV || process.env.NODE_ENV || "production",
          severity,
          errorMessage: message,
          exceptionType: errName,
          createdAt: new Date().toISOString(),
        }).catch((e) => console.error("[incident] Failed to send crash email:", e));
      }
      console.warn(`[incident] Crash email: ${userIds.length} eligible, ${toSend.length} with incident email enabled (title: ${title})`);
    } catch (e) {
      console.error("[incident] Failed to fetch users for crash email:", e);
    }
  }

  process.on("uncaughtException", async (err: Error) => {
    if (sentryDsn) {
      Sentry.captureException(err);
      await Sentry.flush(2000).catch(() => {});
    }
    const title = "PushLog critical error (uncaughtException)";
    const message = err?.message || String(err);
    const errName = err?.name || "Error";
    sendCrashEmailsToUsers(title, message, errName, "critical").finally(() => {
      setTimeout(() => process.exit(1), 4000);
    });
  });

  process.on("unhandledRejection", async (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    if (sentryDsn) {
      Sentry.captureException(err);
      await Sentry.flush(2000).catch(() => {});
    }
    const title = "PushLog unhandled rejection";
    const message = err?.message || String(reason);
    const errName = err?.name || "Error";
    void sendCrashEmailsToUsers(title, message, errName, "error");
  });

  process.on("SIGTERM", () => {
    stopIncidentEngine();
  });

  process.on("SIGINT", () => {
    stopIncidentEngine();
  });
})();