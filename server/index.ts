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
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
const { Pool } = pkg;

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the project root (one level up from server directory)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
  tableName: 'user_sessions'
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.github.com", "https://slack.com", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
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
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/health/detailed';
  },
});
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isLoadTesting ? 100 : (isDevelopment ? 20 : 5), // More permissive in dev/load testing
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
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
});
app.use('/api/payments/', paymentLimiter);

// Compression
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://pushlog.ai', 'https://www.pushlog.ai'] 
    : ['https://pushlog.ai'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

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

app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
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

      log(logLine);
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

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5001;
  server.listen({
    port,
    host: "0.0.0.0",
    // reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();

