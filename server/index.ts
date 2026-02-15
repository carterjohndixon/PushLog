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
import pkg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const { Pool } = pkg;

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the project root (one level up from server directory)
// Load .env.{APP_ENV} (e.g. .env.production, .env.staging) when set so env vars are applied regardless of PM2/Docker
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });
const appEnv = process.env.APP_ENV || '';
if (appEnv && appEnv !== 'development') {
  dotenv.config({ path: path.join(root, `.env.${appEnv}`) });
}

// Initialize Sentry for error tracking
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
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
const sentryDsn = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || "https://76dff591029ab7f40572c74af67aa470@o4510881753137152.ingest.us.sentry.io/4510881854521344";
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
app.post(
  "/api/webhooks/github",
  express.raw({ type: "application/json", limit: "1mb" }),
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const raw = req.body;
    if (!raw || !Buffer.isBuffer(raw)) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const sig = req.headers["x-hub-signature-256"] as string | undefined;
    const secret = process.env.GITHUB_WEBHOOK_SECRET || "default_secret";
    if (sig && !verifyWebhookSignature(raw.toString("utf8"), sig, secret)) {
      console.error("❌ Invalid webhook signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
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
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: true, // Set to true to ensure session is saved even if not modified (needed for rolling sessions)
  saveUninitialized: false,
  rolling: true, // Reset expiration on every request (keeps session alive during activity)
  name: 'connect.sid',
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
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

    // Log error to Sentry
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err);
    }

    res.status(status).json({ message });
    throw err;
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

  process.on("SIGTERM", () => {
    stopIncidentEngine();
  });

  process.on("SIGINT", () => {
    stopIncidentEngine();
  });
})();

