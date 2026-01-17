import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { generateToken, verifyToken } from './jwt';
import { authenticateToken, requireEmailVerification } from './middleware/auth';
import { 
  exchangeCodeForToken, 
  getGitHubUser, 
  getUserRepositories, 
  createWebhook,
  deleteWebhook,
  verifyWebhookSignature,
  validateGitHubToken,
  getGitHubTokenScopes
} from "./github";
import { exchangeGoogleCodeForToken, getGoogleUser } from "./google";
import { 
  sendPushNotification, 
  sendIntegrationWelcomeMessage,
  sendSlackMessage,
  getSlackChannels, 
  testSlackConnection,
  generateSlackOAuthUrl,
  exchangeSlackCodeForToken,
  getSlackWorkspaceInfo,
  getSlackChannelsForWorkspace
} from "./slack";
import { insertIntegrationSchema, insertRepositorySchema } from "@shared/schema";
import { databaseStorage } from "./database";
import { sendVerificationEmail, sendPasswordResetEmail } from './email';
import { generateCodeSummary, generateSlackMessage } from './ai';
import { createStripeCustomer, createPaymentIntent, stripe, CREDIT_PACKAGES } from './stripe';
import { body, validationResult } from "express-validator";

// Extend global type for notification streams
declare global {
  var notificationStreams: Map<number, any> | undefined;
}

// Helper function to get user ID from OAuth state
async function getUserIdFromOAuthState(state: string): Promise<number | null> {
  try {
    const session = await databaseStorage.getOAuthSession(state);
    return session ? session.userId : null;
  } catch (error) {
    console.error('Error getting user from OAuth state:', error);
    return null;
  }
}

const SALT_ROUNDS = 10;

// Helper function to broadcast notifications to connected clients
function broadcastNotification(userId: number, notification: any) {
  if (global.notificationStreams?.has(userId)) {
    const stream = global.notificationStreams.get(userId);
    if (stream) {
      stream.write(`data: ${JSON.stringify({ type: 'notification', data: notification })}\n\n`);
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoints
  app.get("/health", (req, res) => {
    res.status(200).json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Deployment webhook endpoint (secured with secret token)
  app.post("/api/webhooks/deploy", async (req, res) => {
    try {
      // Verify GitHub webhook signature (primary security)
      const signature = req.headers['x-hub-signature-256'] as string;
      const deploySecret = process.env.DEPLOY_SECRET || '';
      const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET || '';
      const webhookSecret = deploySecret || githubWebhookSecret;
      
      if (signature && webhookSecret) {
        const payload = JSON.stringify(req.body);
        if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      } else if (!signature) {
        // Fallback: Check for custom header if no GitHub signature
        const providedSecret = req.headers['x-deploy-secret'] as string;
        
        if (!deploySecret || providedSecret !== deploySecret) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      } else {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get deployment script path
      const appDir = process.env.APP_DIR || '/var/www/pushlog';
      const deployScript = path.join(appDir, 'deploy.sh');

      // Check if deploy script exists
      if (!fs.existsSync(deployScript)) {
        console.error(`❌ Deploy script not found: ${deployScript}`);
        return res.status(500).json({ error: 'Deploy script not found' });
      }

      // Execute deployment script asynchronously (don't wait for it to finish)
      execAsync(`bash ${deployScript}`, {
        cwd: appDir,
        env: {
          ...process.env,
          APP_DIR: appDir,
          DEPLOY_BRANCH: req.body.ref?.replace('refs/heads/', '') || 'main',
          PATH: process.env.PATH // Ensure PATH includes PM2
        },
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer for output
      }).then(({ stdout, stderr }) => {
        if (stderr) {
          console.error('Deployment stderr:', stderr);
        }
      }).catch((error) => {
        console.error('Deployment failed:', error.message);
      });

      // Respond immediately (deployment runs in background)
      res.status(200).json({ 
        message: 'Deployment started',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Deployment webhook error:', error);
      res.status(500).json({ error: 'Deployment failed' });
    }
  });

  app.get("/health/detailed", async (req, res) => {
    try {
      // Check database connection
      const dbCheck = await databaseStorage.getDatabaseHealth();
      
      // Check external services
      const services = {
        database: dbCheck,
        github: "unknown", // Could add actual GitHub API check
        slack: "unknown",  // Could add actual Slack API check
        stripe: "unknown"  // Could add actual Stripe API check
      };

      const isHealthy = dbCheck === "healthy";
      
      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Login route
  app.post("/api/login", [
    body('identifier').trim().isLength({ min: 1 }).withMessage('Email/username is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required')
  ], async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: errors.array() 
        });
      }

      const { identifier, password } = req.body;

      // Try to find user by email or username
      let user = await databaseStorage.getUserByEmail(identifier);
      if (!user) {
        user = await databaseStorage.getUserByUsername(identifier);
      }

      if (!user) {
        return res.status(401).send("Invalid email/username or password");
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password || '');
      if (!passwordMatch) {
        return res.status(401).send("Invalid email/username or password");
      }

      // Generate JWT token
      const token = generateToken({
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: !!user.githubId,
        googleConnected: !!user.googleId,
        emailVerified: !!user.emailVerified
      });

      res.status(200).json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username || '',
          email: user.email || null,
          isUsernameSet: true,
          emailVerified: !!user.emailVerified,
          githubConnected: !!user.githubId
        }
      });
    } catch (error) {
      res.status(500).send("An error occurred while trying to log in");
    }
  });

  // Add GitHub connection initiation endpoint
  app.get("/api/github/connect", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      // User will be available from authenticateToken middleware
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ 
          error: "Authentication required",
          redirectTo: "/login"
        });
      }

      // Check if user already has GitHub connected and validate the token
      const user = await databaseStorage.getUserById(userId);
      if (user?.githubId && user?.githubToken) {
        try {
          const isValid = await validateGitHubToken(user.githubToken);
          if (isValid) {
            // Check if token has the 'repo' scope
            const scopes = await getGitHubTokenScopes(user.githubToken);
            const hasRepoScope = scopes.includes("repo");
            
            if (hasRepoScope) {
              // Token is valid and has repo scope, already connected properly
              return res.status(400).json({
                error: "GitHub account already connected"
              });
            } else {
              // Token is valid but missing repo scope, clear and allow reconnection
              console.log("GitHub token missing 'repo' scope, clearing connection to allow reconnection");
              await databaseStorage.updateUser(userId, {
                githubId: null,
                githubToken: null
              });
            }
          } else {
            // Token is invalid, clear the connection and allow reconnection
            await databaseStorage.updateUser(userId, {
              githubId: null,
              githubToken: null
            });
          }
        } catch (error) {
          console.error('GitHub token validation error:', error);
          // Clear invalid connection and allow reconnection
          await databaseStorage.updateUser(userId, {
            githubId: null,
            githubToken: null
          });
        }
      }

      // Generate state for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');
      
      // Store the state and user ID in a temporary session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await databaseStorage.storeOAuthSession({
        token: sessionToken,
        state,
        userId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      });

      // Build the GitHub OAuth URL (use OAuth App, not GitHub App)
      const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID || "Ov23li5UgB18JcaZHnxk";
      const redirectUri = process.env.APP_URL ? `${process.env.APP_URL}/api/auth/user` : "https://pushlog.ai/api/auth/user";
      const scope = "repo user:email admin:org_hook";
      
      console.log("GitHub OAuth connect - Client ID:", clientId.substring(0, 10) + "...");
      console.log("GitHub OAuth connect - Redirect URI:", redirectUri);
      
      const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
      
      // Instead of redirecting, send the URL and state back to the client
      res.json({ url, state });
    } catch (error) {
      console.error('GitHub connection initiation failed:', error);
      res.status(500).json({ error: 'Failed to initiate GitHub connection' });
    }
  });

  // Disconnect GitHub account
  app.post("/api/github/disconnect", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Clear GitHub connection
      await databaseStorage.updateUser(userId, {
        githubId: null,
        githubToken: null
      });

      console.log(`GitHub disconnected for user ${userId}`);
      res.json({ success: true, message: "GitHub account disconnected successfully" });
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error);
      res.status(500).json({ error: 'Failed to disconnect GitHub account' });
    }
  });

  // Get current user info or handle GitHub OAuth
  app.get("/api/auth/user", async (req, res) => {
    try {
      // Check if this is a GitHub OAuth callback
      const code = req.query.code as string;
      const error = req.query.error as string;
      
      if (error) {
        console.error("GitHub OAuth error from callback:", error, req.query.error_description);
        return res.redirect(`/dashboard?error=github_oauth_error&message=${encodeURIComponent(error)}`);
      }
      
      if (code) {
        console.log("GitHub OAuth callback received, exchanging code for token...");
        // Handle GitHub OAuth
        let token: string;
        try {
          token = await exchangeCodeForToken(code);
          console.log("Successfully exchanged code for token");
        } catch (tokenError) {
          console.error("Failed to exchange code for token:", tokenError);
          throw new Error(`Failed to exchange GitHub authorization code: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
        }
        
        let githubUser;
        try {
          githubUser = await getGitHubUser(token);
          console.log("Successfully fetched GitHub user:", githubUser.login);
        } catch (userError) {
          console.error("Failed to get GitHub user:", userError);
          throw new Error(`Failed to fetch GitHub user info: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
        }

        // Check if there's a current session/user trying to connect
        const state = req.query.state as string;
        const currentUserId = state ? await getUserIdFromOAuthState(state) : null;
        console.log(`OAuth callback - state: ${state}, currentUserId: ${currentUserId}`);
        
        let user;
        if (currentUserId) {
          // User is already logged in and trying to connect GitHub
          console.log(`User ${currentUserId} is connecting GitHub account`);
          const currentUser = await databaseStorage.getUserById(currentUserId);
          if (currentUser) {
            // Check if GitHub account is already connected to another user
            const existingUser = await databaseStorage.getUserByGithubId(githubUser.id.toString());
            if (existingUser && existingUser.id !== currentUser.id) {
              return res.redirect(`/dashboard?error=github_already_connected&message=${encodeURIComponent('This GitHub account is already connected to another PushLog account. Please use a different GitHub account or contact support.')}`);
            }
            
            // Update current user's GitHub connection
            user = await databaseStorage.updateUser(currentUser.id, {
              githubId: githubUser.id.toString(),
              githubToken: token,
              email: githubUser.email || currentUser.email,
              emailVerified: true
            });
            console.log(`Updated user ${currentUser.id} with GitHub connection`);
          }
        } else {
          // No current session - this is a login flow
          console.log(`No current session - checking for existing user with GitHub ID ${githubUser.id}`);
          // No current session - check if user already exists with this GitHub ID
          const existingUser = await databaseStorage.getUserByGithubId(githubUser.id.toString());
          if (existingUser) {
            // Log in existing user
            console.log(`Found existing user ${existingUser.id}, logging in`);
            user = await databaseStorage.updateUser(existingUser.id, {
              githubToken: token, // Update token in case it changed
              email: githubUser.email || existingUser.email,
              emailVerified: true
            });
          } else {
            // Check if user exists with this username (from previous signup)
            console.log(`Checking for existing user with username: ${githubUser.login}`);
            const existingUserByUsername = await databaseStorage.getUserByUsername(githubUser.login);
            if (existingUserByUsername) {
              // User exists with this username but no GitHub connection - update it
              console.log(`Found existing user ${existingUserByUsername.id} with username ${githubUser.login}, connecting GitHub`);
              user = await databaseStorage.updateUser(existingUserByUsername.id, {
                githubId: githubUser.id.toString(),
                githubToken: token,
                email: githubUser.email || existingUserByUsername.email,
                emailVerified: true
              });
              console.log(`Updated user ${existingUserByUsername.id} with GitHub connection`);
            } else {
              // Create new user - but wrap in try-catch to handle race conditions
              console.log(`No existing user found, creating new user for GitHub user ${githubUser.login}`);
              try {
                user = await databaseStorage.createUser({
                  username: githubUser.login,
                  email: githubUser.email,
                  githubId: githubUser.id.toString(),
                  githubToken: token,
                  emailVerified: true
                });
                console.log(`Created new user ${user?.id}`);
              } catch (createError: any) {
                // If username already exists (race condition or check missed it), find and update
                console.error(`Error creating user:`, createError.message);
                if (createError.message && (createError.message.includes('users_username_key') || createError.message.includes('duplicate key'))) {
                  console.log(`Username conflict detected, finding existing user by username: ${githubUser.login}`);
                  const conflictUser = await databaseStorage.getUserByUsername(githubUser.login);
                  if (conflictUser) {
                    console.log(`Found conflicting user ${conflictUser.id}, updating with GitHub connection`);
                    user = await databaseStorage.updateUser(conflictUser.id, {
                      githubId: githubUser.id.toString(),
                      githubToken: token,
                      email: githubUser.email || conflictUser.email,
                      emailVerified: true
                    });
                    console.log(`Updated existing user ${conflictUser.id} with GitHub connection`);
                  } else {
                    console.error(`Username conflict but couldn't find user - this shouldn't happen`);
                    throw createError;
                  }
                } else {
                  throw createError;
                }
              }
            }
          }
        }

        if (!user || !user.id) {
          console.error("Failed to create/update user. User object:", user);
          throw new Error('Failed to create or update user properly');
        }

        console.log(`Successfully created/updated user ${user.id} with GitHub ID ${githubUser.id}`);

        // Generate JWT token
        const jwtToken = generateToken({
          userId: user.id,
          username: user.username || '',
          email: user.email || null,
          githubConnected: true,
          googleConnected: !!user.googleId,
          emailVerified: true
        });

        // For OAuth callback, redirect to dashboard with token in hash
        const redirectUrl = `/dashboard#token=${jwtToken}`;
        console.log(`Redirecting to dashboard with token for user ${user.id}`);
        return res.redirect(redirectUrl);
      }

      // If no code, this is a regular user info request
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "No authorization header" });
      }

      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ error: "Invalid token" });
      }

      // Get user info
      const user = await databaseStorage.getUserById(decoded.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username || '',
          email: user.email || null,
          isUsernameSet: !!user.username,
          emailVerified: !!user.emailVerified,
          githubConnected: !!user.githubId,
          googleConnected: !!user.googleId
        }
      });
    } catch (error) {
      console.error("Auth error:", error);
      const errorMessage = error instanceof Error ? error.message : "Authentication failed";
      // Redirect to login with error message instead of returning JSON
      const redirectUrl = `/login?error=${encodeURIComponent(errorMessage)}`;
      return res.redirect(redirectUrl);
    }
  });

  // Add Google OAuth callback route
  app.get("/api/google/user", async (req, res) => {
    try {
      const code = req.query.code as string;
      const token = await exchangeGoogleCodeForToken(code);
      const googleUser = await getGoogleUser(token);

      // Try to find existing user
      let user = await databaseStorage.getUserByEmail(googleUser.email);
      let isNewUser = false;
      
      if (!user) {
        isNewUser = true;
        
        // Generate a unique username from email
        let baseUsername = googleUser.email.split('@')[0];
        let username = baseUsername;
        let counter = 1;

        // Keep trying until we find a unique username
        while (true) {
          try {
            const existingUser = await databaseStorage.getUserByUsername(username);
            if (!existingUser) {
              break; // Username is available
            }
            username = `${baseUsername}${counter}`; // Add number suffix
            counter++;
          } catch (error) {
            console.error("Error checking username:", error);
            throw error;
          }
        }

        // Generate email verification token for new Google users
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Create new user if they don't exist (unverified initially)
        user = await databaseStorage.createUser({
          username: username, // Use the unique username we generated
          email: googleUser.email,
          googleId: googleUser.id,
          googleToken: token,
          emailVerified: false, // Google OAuth users still need to verify email
          verificationToken,
          verificationTokenExpiry: verificationTokenExpiry.toISOString(),
        });

        // Send verification email for new Google OAuth users
        try {
          await sendVerificationEmail(googleUser.email, verificationToken);
          
          // Create notification for email verification
          try {
            await storage.createNotification({
              userId: user.id,
              type: 'email_verification',
              title: 'Email Verification Required',
              message: 'Please check your email and verify your address to access all features'
            });
          } catch (notificationError) {
            console.error('Failed to create verification notification:', notificationError);
          }
        } catch (emailError) {
          console.error('Failed to send verification email to Google OAuth user:', emailError);
          // Don't fail the OAuth flow if email sending fails
        }
      } else {
        // Update existing user's Google token
        user = await databaseStorage.updateUser(user.id, {
          googleToken: token,
          googleId: googleUser.id, // Make sure to update the Google ID as well
        });
      }

      if (!user) {
        throw new Error("Failed to create or update user");
      }

      // Generate JWT token
      const jwtToken = generateToken({
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: !!user.githubId,
        googleConnected: true,
        emailVerified: !!user.emailVerified
      });

      // Store token in localStorage via redirect with hash
      res.redirect(`/dashboard#token=${jwtToken}`);
    } catch (error) {
      console.error("Google auth error:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  // Create signup for user and create user
  app.post("/api/signup", [
    body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  ], async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: errors.array() 
        });
      }

      const { username, email, password } = req.body;

      // Validate password requirements
      const passwordRequirements = {
        minLength: password.length >= 8,
        hasUpperCase: /[A-Z]/.test(password),
        hasLowerCase: /[a-z]/.test(password),
        hasNumber: /[0-9]/.test(password),
        hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
      };

      const missingRequirements = Object.entries(passwordRequirements)
        .filter(([, meets]) => !meets)
        .map(([req]) => {
          switch(req) {
            case 'minLength': return 'at least 8 characters';
            case 'hasUpperCase': return 'an uppercase letter';
            case 'hasLowerCase': return 'a lowercase letter';
            case 'hasNumber': return 'a number';
            case 'hasSpecialChar': return 'a special character';
            default: return '';
          }
        });

      if (missingRequirements.length > 0) {
        return res.status(400).send(
          `Password must contain ${missingRequirements.join(', ')}`
        );
      }

      // Check if username is already taken
      const existingUsername = await databaseStorage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).send("Username is already taken");
      }

      // Check if email is already taken
      const existingEmail = await databaseStorage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).send("Email is already registered");
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      // Create user with hashed password and verification token
      const user = await databaseStorage.createUser({
        username,
        email,
        password: hashedPassword,
        emailVerified: false,
        verificationToken,
        verificationTokenExpiry,
      });

      // Send verification email
      await sendVerificationEmail(email, verificationToken);

      // Generate JWT token
      const token = generateToken({
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: false,
        googleConnected: false,
        emailVerified: false
      });

      res.status(200).json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username || '',
          email: user.email || null,
          isUsernameSet: true,
          emailVerified: false,
          githubConnected: false
        }
      });
    } catch (error) {
      res.status(500).send("Failed to create account");
    }
  });

  // Add email verification endpoint
  app.get("/api/verify-email", async (req, res) => {
    try {
      const verificationToken = req.query.token as string;

      if (!verificationToken) {
        return res.status(400).json({ error: "Verification token is required" });
      }

      // Find user by verification token
      const user = await databaseStorage.getUserByVerificationToken(verificationToken);

      if (!user) {
        return res.status(400).json({ error: "Invalid verification token" });
      }

      // Check if token is expired
      if (user.verificationTokenExpiry && new Date(user.verificationTokenExpiry) < new Date()) {
        return res.status(400).json({ error: "Verification token has expired" });
      }

      // Update user as verified
      await databaseStorage.updateUser(user.id, {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null
      });

      // Remove any existing email verification notifications
      try {
        const existingNotifications = await storage.getNotificationsByUserId(user.id);
        const emailVerificationNotifications = existingNotifications.filter(n => n.type === 'email_verification');
        
        for (const notification of emailVerificationNotifications) {
          await storage.deleteNotification(notification.id);
        }
      } catch (notificationError) {
        console.error("Error removing email verification notifications:", notificationError);
        // Don't fail the verification process if notification cleanup fails
      }

      // Generate new JWT with emailVerified: true
      const newToken = generateToken({
        userId: user.id,
        username: user.username || '',
        email: user.email || null,
        githubConnected: !!user.githubId,
        googleConnected: !!user.googleId,
        emailVerified: true
      });

      res.status(200).json({
        success: true,
        token: newToken,
        message: "Email verified successfully"
      });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // Resend verification email
  app.post("/api/resend-verification", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.emailVerified) {
        return res.status(400).json({ error: "Email is already verified" });
      }

      if (!user.email) {
        return res.status(400).json({ error: "No email address associated with account" });
      }

      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Update user with new verification token
      await databaseStorage.updateUser(userId, {
        verificationToken,
        verificationTokenExpiry: verificationTokenExpiry.toISOString()
      });

      // Send verification email
      await sendVerificationEmail(user.email, verificationToken);

      // Create notification for resend email
      let notification;
      try {
        const notificationData = {
          userId,
          type: 'email_verification',
          title: 'Verification Email Resent',
          message: 'A new verification email has been sent to your inbox.'
        };
        notification = await storage.createNotification(notificationData);
      } catch (error) {
        console.error('Error creating notification:', error);
        return res.status(500).json({ error: "Failed to create notification" });
      }

      // Broadcast the notification via SSE for real-time updates
      broadcastNotification(userId, notification);

      res.status(200).json({
        success: true,
        message: "Verification email sent successfully"
      });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to send verification email" });
    }
  });

  // Add logout route
  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.redirect("/login");
    });
  });

  // Get user repositories
  app.get("/api/repositories", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get user to check GitHub connection
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.githubId || !user.githubToken) {
        return res.status(404).json({ error: "No repositories found. Please check your GitHub connection." });
      }

      // Validate GitHub token before fetching repositories
      try {
        const isValid = await validateGitHubToken(user.githubToken);
        if (!isValid) {
          // Clear invalid connection
          await databaseStorage.updateUser(userId, {
            githubId: null,
            githubToken: null
          });
          return res.status(401).json({ 
            error: "GitHub token has expired. Please reconnect your GitHub account.",
            redirectTo: "/login"
          });
        }
      } catch (validationError) {
        console.error("GitHub token validation error:", validationError);
        // Clear invalid connection
        await databaseStorage.updateUser(userId, {
          githubId: null,
          githubToken: null
        });
        return res.status(401).json({ 
          error: "GitHub token has expired. Please reconnect your GitHub account.",
          redirectTo: "/login"
        });
      }

      try {
        // Fetch repositories from GitHub
        const repositories = await getUserRepositories(user.githubToken);
        
        // Get already connected repositories
        const connectedRepos = await databaseStorage.getRepositoriesByUserId(userId);
        
        // Mark repositories that are already connected and include internal database ID
        const enrichedRepos = repositories.map(repo => {
          const connectedRepo = connectedRepos.find(connectedRepo => connectedRepo.githubId === repo.id.toString());
          return {
            ...repo,
            githubId: repo.id.toString(), // Always include the GitHub ID
            id: connectedRepo?.id, // Include the internal database ID if connected
            isConnected: !!connectedRepo,
            isActive: connectedRepo?.isActive ?? true, // Include the isActive field from database
            monitorAllBranches: connectedRepo?.monitorAllBranches ?? false // Include the monitorAllBranches field from database
          };
        });

        res.json(enrichedRepos);
      } catch (githubError: any) {
        console.error("Failed to fetch GitHub repositories:", githubError);
        
        // Check if error is about missing repo scope
        if (githubError.message && githubError.message.includes("repo' scope")) {
          return res.status(403).json({ 
            error: "Your GitHub token is missing the 'repo' scope required to access private repositories. Please disconnect and reconnect your GitHub account to grant the necessary permissions.",
            requiresReauth: true
          });
        }
        
        return res.status(404).json({ error: "No repositories found. Please check your GitHub connection." });
      }
    } catch (error) {
      console.error("Failed to fetch repositories:", error);
      res.status(500).json({ error: "Failed to fetch repositories" });
    }
  });

  // Get push events for repositories
  app.get("/api/push-events", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get user's repositories
      const userRepositories = await storage.getRepositoriesByUserId(userId);
      const repositoryIds = userRepositories.map(repo => repo.id);

      if (repositoryIds.length === 0) {
        return res.json([]);
      }

      // Get push events for all user's repositories
      const allPushEvents = [];
      for (const repositoryId of repositoryIds) {
        const repoEvents = await storage.getPushEventsByRepositoryId(repositoryId);
        allPushEvents.push(...repoEvents);
      }

      // Format events for frontend
      const formattedEvents = allPushEvents.map((event: any) => ({
        id: event.id,
        repositoryId: event.repositoryId,
        branch: event.branch,
        commitHash: event.commitSha,
        commitMessage: event.commitMessage,
        author: event.author,
        timestamp: event.pushedAt,
        eventType: 'push'
      }));

      res.json(formattedEvents);
    } catch (error) {
      console.error("Failed to fetch push events:", error);
      res.status(500).json({ error: "Failed to fetch push events" });
    }
  });

  // Connect a repository
  app.post("/api/repositories", [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Repository name is required and must be 1-100 characters'),
    body('owner').trim().isLength({ min: 1, max: 100 }).withMessage('Repository owner is required and must be 1-100 characters'),
    body('githubId').isInt({ min: 1 }).withMessage('Valid GitHub ID is required'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    body('monitorAllBranches').optional().isBoolean().withMessage('monitorAllBranches must be a boolean')
  ], authenticateToken, requireEmailVerification, async (req: any, res: any) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: errors.array() 
        });
      }

      const schema = insertRepositorySchema;

      const validatedData = schema.parse(req.body);
      
      const user = await storage.getUser(req.user!.userId);

      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      if (!user.githubId || !user.githubToken) {
        return res.status(401).json({ error: "GitHub not connected. Please try refreshing your GitHub connection." });
      }

      // Create webhook URL
      const domain = process.env.APP_URL || "https://pushlog.ai";
      const webhookUrl = `${domain}/api/webhooks/github`;

      try {
        // First check if user has access to the repository
        const repoCheckResponse = await fetch(`https://api.github.com/repos/${validatedData.owner}/${validatedData.name}`, {
          headers: {
            "Authorization": `Bearer ${user.githubToken}`,
            "Accept": "application/vnd.github.v3+json",
          },
        });

        if (!repoCheckResponse.ok) {
          throw new Error(`Repository access denied: ${repoCheckResponse.statusText}. Make sure you have access to this repository.`);
        }

        const repoData = await repoCheckResponse.json();

        // Check if user has admin permissions (required for webhooks)
        if (!repoData.permissions?.admin) {
          throw new Error("Admin permissions required. You need admin access to this repository to create webhooks.");
        }

        // Try to create webhook with better error handling
        let webhook;
        try {
          webhook = await createWebhook(
            user.githubToken,
            validatedData.owner,
            validatedData.name,
            webhookUrl
          );
        } catch (webhookError) {
          // If webhook creation fails due to OAuth app limitations, provide helpful error
          if (webhookError instanceof Error && webhookError.message.includes('Resource not accessible by integration')) {
            throw new Error("Webhook creation failed. This is likely due to GitHub OAuth app configuration. Please ensure your GitHub OAuth app has the 'repo' and 'admin:org_hook' scopes configured. You may need to reconnect your GitHub account to get the updated permissions.");
          }
          throw webhookError;
        }

        const repository = await storage.createRepository({
          ...validatedData,
          userId: req.user!.userId,
          webhookId: webhook.id.toString(),
        });

        res.json(repository);
      } catch (webhookError) {
        console.error("Webhook creation failed:", webhookError);
        
        // Provide more specific error message
        const errorMessage = webhookError instanceof Error ? webhookError.message : "Unknown error occurred";
        
        // Still create the repository without webhook, but inform the user
        const repository = await storage.createRepository({
          ...validatedData,
          userId: req.user!.userId,
        });
        res.json({
          ...repository,
          warning: `Repository connected but webhook creation failed: ${errorMessage}. Push notifications will not work until webhooks are configured. You may need to reconnect your GitHub account to get updated permissions.`
        });
      }
    } catch (error) {
      console.error("Error connecting repository:", error);
      res.status(400).json({ error: "Invalid repository data" });
    }
  });

  // Update repository
  app.patch("/api/repositories/:id", [
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    body('monitorAllBranches').optional().isBoolean().withMessage('monitorAllBranches must be a boolean')
  ], authenticateToken, async (req: any, res: any) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: errors.array() 
        });
      }

      const repositoryId = parseInt(req.params.id);
      if (isNaN(repositoryId) || repositoryId <= 0) {
        return res.status(400).json({ error: "Invalid repository ID" });
      }
      
      const updates = req.body;
      
      // First verify user owns this repository
      const existingRepository = await storage.getRepository(repositoryId);
      if (!existingRepository) {
        return res.status(404).json({ error: "Repository not found" });
      }
      
      if (existingRepository.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const repository = await storage.updateRepository(repositoryId, updates);
      
      if (!repository) {
        return res.status(404).json({ error: "Repository not found" });
      }

      // If repository isActive status is being updated, also update related integrations
      if (updates.hasOwnProperty('isActive')) {
        // Get all integrations for this user and filter by repository ID
        const userId = req.user?.userId;
        if (userId) {
          const userIntegrations = await storage.getIntegrationsByUserId(userId);
          const relatedIntegrations = userIntegrations.filter(integration => integration.repositoryId === repositoryId);
          
          // Update all integrations for this repository to match the repository's active status
          for (const integration of relatedIntegrations) {
            await storage.updateIntegration(integration.id, {
              isActive: updates.isActive
            });
          }
        }
      }

      res.json(repository);
    } catch (error) {
      console.error("Error updating repository:", error);
      res.status(500).json({ error: "Failed to update repository" });
    }
  });

  // Disconnect a repository
  app.delete("/api/repositories/:id", authenticateToken, async (req, res) => {
    try {
      const repositoryId = parseInt(req.params.id);
      const repository = await storage.getRepository(repositoryId);
      
      if (!repository) {
        return res.status(404).json({ error: "Repository not found" });
      }

      // Verify user owns this repository
      if (repository.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const user = await storage.getUser(repository.userId);
      
      if (user && user.githubToken && repository.webhookId) {
        try {
          await deleteWebhook(
            user.githubToken,
            repository.owner,
            repository.name,
            repository.webhookId
          );
        } catch (webhookError) {
          console.error("Failed to delete webhook:", webhookError);
        }
      }

      await storage.deleteRepository(repositoryId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting repository:", error);
      res.status(500).json({ error: "Failed to disconnect repository" });
    }
  });

  // Test Slack connection
  app.get("/api/slack/test", async (req, res) => {
    try {
      const isConnected = await testSlackConnection();
      res.json({ connected: isConnected });
    } catch (error) {
      console.error("Error testing Slack connection:", error);
      res.status(500).json({ connected: false, error: "Connection test failed" });
    }
  });

  // Add Slack connection initiation endpoint
  app.get("/api/slack/connect", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ 
          error: "Authentication required",
          redirectTo: "/login"
        });
      }

      // Generate state for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');
      
      // Store the state and user ID in a temporary session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await databaseStorage.storeOAuthSession({
        token: sessionToken,
        state,
        userId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      });

      // Check if this is a popup request (client can send popup=true query param)
      const isPopup = req.query.popup === 'true';
      
      // Build the Slack OAuth URL
      const url = generateSlackOAuthUrl(state, isPopup);
      
      // Send the URL back to the client
      res.json({ url, state });
    } catch (error) {
      console.error('Slack connection initiation failed:', error);
      res.status(500).json({ error: 'Failed to initiate Slack connection' });
    }
  });

  // Slack OAuth callback
  app.get("/api/slack/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({ error: "Missing code or state parameter" });
      }

      // Verify state and get user ID
      const session = await databaseStorage.getOAuthSession(state as string);
      if (!session) {
        return res.status(400).json({ error: "Invalid or expired state parameter" });
      }

      // Exchange code for token
      const slackData = await exchangeSlackCodeForToken(code as string);
      
      // Get workspace info
      const workspaceInfo = await getSlackWorkspaceInfo(slackData.access_token);

      // Check if workspace already exists for this user
      const existingWorkspace = await databaseStorage.getSlackWorkspaceByTeamId(slackData.team.id);
      
      if (existingWorkspace && existingWorkspace.userId === session.userId) {
        // Update existing workspace
        await databaseStorage.updateSlackWorkspace(existingWorkspace.id, {
          accessToken: slackData.access_token,
          teamName: slackData.team.name
        });
      } else {
        // Create new workspace
        await databaseStorage.createSlackWorkspace({
          userId: session.userId,
          teamId: slackData.team.id,
          teamName: slackData.team.name,
          accessToken: slackData.access_token
        });
      }

      // Clean up session
      await databaseStorage.deleteOAuthSession(state as string);

      // Check if this is a popup request (via query param)
      const isPopup = req.query.popup === 'true';
      
      if (isPopup) {
        // Return HTML that closes popup and notifies parent
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head><title>Slack Connected</title></head>
            <body>
              <script>
                if (window.opener) {
                  window.opener.postMessage('slack-connected', '*');
                  window.close();
                } else {
                  window.location.href = '/dashboard#slack=connected';
                }
              </script>
              <p>Slack workspace connected! This window will close automatically...</p>
            </body>
          </html>
        `);
      }

      // Redirect to dashboard with success
      res.redirect(`/dashboard#slack=connected`);
    } catch (error) {
      console.error('Slack OAuth callback error:', error);
      
      const isPopup = req.query.popup === 'true';
      if (isPopup) {
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head><title>Slack Connection Failed</title></head>
            <body>
              <script>
                if (window.opener) {
                  window.opener.postMessage('slack-error', '*');
                  window.close();
                } else {
                  window.location.href = '/dashboard#error=${encodeURIComponent('Failed to connect Slack workspace')}';
                }
              </script>
              <p>Failed to connect Slack workspace. This window will close automatically...</p>
            </body>
          </html>
        `);
      }
      
      res.redirect(`/dashboard#error=${encodeURIComponent('Failed to connect Slack workspace')}`);
    }
  });

  // Get user's Slack workspaces
  app.get("/api/slack/workspaces", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const workspaces = await databaseStorage.getSlackWorkspacesByUserId(userId);
      res.json(workspaces);
    } catch (error) {
      console.error('Error fetching Slack workspaces:', error);
      res.status(500).json({ error: 'Failed to fetch Slack workspaces' });
    }
  });

  // Get channels for a specific workspace
  app.get("/api/slack/workspaces/:workspaceId/channels", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user?.userId;
      const workspaceId = parseInt(req.params.workspaceId);
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const workspace = await databaseStorage.getSlackWorkspace(workspaceId);
      
      if (!workspace || workspace.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const channels = await getSlackChannelsForWorkspace(workspace.accessToken);
      res.json(channels);
    } catch (error) {
      console.error('Error fetching Slack channels:', error);
      res.status(500).json({ error: 'Failed to fetch Slack channels' });
    }
  });

  // Create integration
  app.post("/api/integrations", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const validatedData = insertIntegrationSchema.parse(req.body);
      
      // Auto-enable the repository when creating an integration
      // This makes sense because if someone is creating an integration, they want to monitor the repository
      const repository = await storage.getRepository(validatedData.repositoryId);
      if (repository && repository.isActive === false) {
        await storage.updateRepository(validatedData.repositoryId, { isActive: true });
      }
      
      const integration = await storage.createIntegration({
        ...validatedData,
        userId: userId
      });
      
      // Send welcome message to Slack if integration is active
      if (integration.isActive) {
        try {
          // Get repository info for the welcome message (get fresh data after update)
          const updatedRepository = await storage.getRepository(integration.repositoryId);
          
          if (updatedRepository) {
            await sendIntegrationWelcomeMessage(
              integration.slackChannelId,
              updatedRepository.name,
              integration.slackChannelName
            );
            
            // Store notification in database
            await storage.createNotification({
              userId: integration.userId,
              type: 'slack_message_sent',
              title: 'Slack Message Sent',
              message: `Welcome message sent to ${integration.slackChannelName} for ${updatedRepository.name}`
            });
            
            // Also broadcast via SSE for real-time updates
            broadcastNotification(integration.userId, {
              type: 'slack_message_sent',
              title: 'Slack Message Sent',
              message: `Welcome message sent to ${integration.slackChannelName} for ${updatedRepository.name}`,
              createdAt: new Date().toISOString()
            });
          }
        } catch (slackError) {
          console.error("Failed to send welcome message:", slackError);
          // Don't fail the integration creation if Slack message fails
        }
      }
      
      res.json(integration);
    } catch (error) {
      console.error("Error creating integration:", error);
      res.status(400).json({ error: "Invalid integration data" });
    }
  });

  // Get user stats
  app.get("/api/stats", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const stats = await storage.getStatsForUser(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Get user integrations
  app.get("/api/integrations", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;

      const integrations = await storage.getIntegrationsByUserId(userId);
      
      // Enrich integrations with repository names
      const enrichedIntegrations = await Promise.all(
        integrations.map(async (integration) => {
          
          // let repository = await storage.getRepository(integration.id);
          let repository = await storage.getRepository(integration.repositoryId);
          
          if (!repository) {
            repository = await storage.getRepositoryByGithubId(integration.repositoryId.toString());
          }
          
          return {
            ...integration,
            repositoryName: repository?.name || 'Unknown Repository',
            lastUsed: integration.createdAt, // Use createdAt as lastUsed
            status: integration.isActive ? 'active' : 'paused',
            notificationLevel: integration.notificationLevel || 'all',
            includeCommitSummaries: integration.includeCommitSummaries ?? true
          };
        })
      );
      
      res.json(enrichedIntegrations);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });

  // Update integration
  app.patch("/api/integrations/:id", authenticateToken, async (req, res) => {
    try {
      const integrationId = parseInt(req.params.id);
      const updates = req.body;
      
      // First verify user owns this integration
      const existingIntegration = await storage.getIntegration(integrationId);
      if (!existingIntegration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      if (existingIntegration.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const integration = await storage.updateIntegration(integrationId, updates);
      
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      // If integration is being activated (unpaused), also activate the repository
      if (updates.isActive === true && integration.repositoryId) {
        const repository = await storage.getRepository(integration.repositoryId);
        if (repository && repository.isActive === false) {
          await storage.updateRepository(integration.repositoryId, { isActive: true });
        }
      }

      res.json(integration);
    } catch (error) {
      console.error("Error updating integration:", error);
      res.status(500).json({ error: "Failed to update integration" });
    }
  });

  // Delete integration
  app.delete("/api/integrations/:id", authenticateToken, async (req, res) => {
    try {
      const integrationId = parseInt(req.params.id);
      
      // First get the integration to verify ownership
      const integration = await storage.getIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      // Verify user owns this integration
      if (integration.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const success = await storage.deleteIntegration(integrationId);
      
      if (!success) {
        return res.status(404).json({ error: "Integration not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting integration:", error);
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });

  // Get user stats (authenticated version)
  app.get("/api/stats", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const stats = await storage.getStatsForUser(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Get push events (authenticated version)
  app.get("/api/push-events", authenticateToken, async (req, res) => {
    try {
      const repositoryId = req.query.repositoryId as string;
      
      if (!repositoryId) {
        return res.status(400).json({ error: "Repository ID required" });
      }

      // Verify user owns this repository
      const repository = await storage.getRepository(parseInt(repositoryId));
      if (!repository || repository.userId !== req.user!.userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const pushEvents = await storage.getPushEventsByRepositoryId(parseInt(repositoryId));
      res.json(pushEvents);
    } catch (error) {
      console.error("Error fetching push events:", error);
      res.status(500).json({ error: "Failed to fetch push events" });
    }
  });

  // Test endpoint to re-process a specific push event with AI
  app.post("/api/test-ai-summary/:pushEventId", authenticateToken, async (req, res) => {
    try {
      const pushEventId = parseInt(req.params.pushEventId);
      const userId = req.user!.userId;
      
      // Get user's first active integration for testing
      const userIntegrations = await storage.getIntegrationsByUserId(userId);
      const activeIntegration = userIntegrations.find(integration => integration.isActive);
      
      if (!activeIntegration) {
        return res.status(400).json({ error: "No active integrations found. Please create an integration first." });
      }
      
      // For now, let's just test the GitHub API with a known commit
      const testPushData = {
        repositoryName: "carterjohndixon/PushLog",
        branch: "main",
        commitMessage: "Test commit for AI summary",
        filesChanged: ["server/ai.ts", "server/routes.ts"],
        additions: 0,
        deletions: 0,
        commitSha: "77975ce720ad61f5566d3c745ef595e2242274f2", // Use your recent commit SHA
      };
      
      // Try to fetch actual stats from GitHub API
      try {
        const [owner, repoName] = testPushData.repositoryName.split('/');
        
        const githubResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/commits/${testPushData.commitSha}`,
          {
            headers: {
              'Authorization': `token ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );
        
        if (githubResponse.ok) {
          const commitData = await githubResponse.json();
          testPushData.additions = commitData.stats?.additions || 0;
          testPushData.deletions = commitData.stats?.deletions || 0;
        } else {
          const errorText = await githubResponse.text();
          console.error(`❌ GitHub API error: ${githubResponse.status} - ${errorText}`);
        }
      } catch (apiError) {
        console.error('❌ Failed to fetch commit stats from GitHub API:', apiError);
      }
      
      // Generate AI summary using the integration's model settings
      const aiModel = activeIntegration.aiModel || 'gpt-3.5-turbo';
      const maxTokens = activeIntegration.maxTokens || 350;
      
      const summary = await generateCodeSummary(
        testPushData, 
        aiModel,
        maxTokens
      );

      // Send to Slack
      try {
        const slackMessage = await generateSlackMessage(testPushData, summary.summary);
        
        await sendSlackMessage({
          channel: activeIntegration.slackChannelId,
          text: slackMessage,
          unfurl_links: false
        });
      } catch (slackError) {
        console.error("❌ Failed to send Slack message:", slackError);
      }
      
      res.json({
        success: true,
        pushEventId,
        summary,
        pushData: testPushData,
        slackMessage: await generateSlackMessage(testPushData, summary.summary)
      });
      
    } catch (error) {
      console.error("Error testing AI summary:", error);
      res.status(500).json({ error: "Failed to test AI summary" });
    }
  });

  // GitHub webhook endpoint
  // Get a webhook for the user's repo? Use: POST /repos/{owner}/{repo}/hooks
  app.post("/api/webhooks/github", async (req, res) => {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;
      const payload = JSON.stringify(req.body);
      
      // Verify webhook signature
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || "default_secret";
      if (signature && !verifyWebhookSignature(payload, signature, webhookSecret)) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      // Handle both push and pull_request events
      const eventType = req.headers['x-github-event'];
      let branch, commit, repository;
      
      if (eventType === 'pull_request') {
        // Handle pull_request events (PR merges)
        const { pull_request, action } = req.body;
        
        if (!pull_request) {
          return res.status(200).json({ message: "Not a pull request event, skipping" });
        }
        
        // Only process when PR is merged (not just closed)
        if (action !== 'closed' || !pull_request.merged) {
          return res.status(200).json({ message: "Pull request not merged, skipping" });
        }
        
        branch = pull_request.base.ref;
        commit = {
          id: pull_request.merge_commit_sha,
          message: pull_request.title,
          author: { name: pull_request.user.login },
          timestamp: pull_request.merged_at,
          additions: pull_request.additions || 0,
          deletions: pull_request.deletions || 0
        };
        repository = req.body.repository;
        
      } else if (eventType === 'push') {
        // Handle push events (direct pushes to main)
        const { ref, commits, repository: repo } = req.body;
        
        // Extract branch name from ref
        branch = ref.replace('refs/heads/', '');
        
        // Only process pushes to main branch
        if (branch !== 'main' && branch !== 'master') {
          return res.status(200).json({ message: `Push to ${branch} branch ignored, only processing main/master` });
        }
        
        if (!commits || commits.length === 0) {
          return res.status(200).json({ message: "No commits to process" });
        }
        
        commit = commits[0]; // Process the first commit
        repository = repo;
        
      } else {
        return res.status(200).json({ message: `Unsupported event type: ${eventType}` });
      }
      
      if (!repository) {
        return res.status(200).json({ message: "No repository information found" });
      }

      // Find the repository in our database
      const storedRepo = await storage.getRepositoryByGithubId(repository.id.toString());
      
      if (!storedRepo || !storedRepo.isActive) {
        return res.status(200).json({ message: "Repository not active" });
      }

      // Get the integration for this repository
      const integration = await storage.getIntegrationByRepositoryId(storedRepo.id);
      
      if (!integration || !integration.isActive) {
        return res.status(200).json({ message: "Integration not active" });
      }

      // Check notification level before processing
      if (integration.notificationLevel === 'main_only') {
        // Only process PRs that merge to main/master branch
        if (branch !== 'main' && branch !== 'master') {
          return res.status(200).json({ message: `PR merged to ${branch} branch ignored due to 'main_only' notification level` });
        }
      }
      
      // Store push event first to get the ID
      const pushEvent = await storage.createPushEvent({
        repositoryId: storedRepo.id,
        integrationId: integration.id,
        commitSha: commit.id,
        commitMessage: commit.message,
        author: commit.author.name,
        branch,
        pushedAt: new Date(commit.timestamp),
        notificationSent: false,
        aiSummary: null,
        aiImpact: null,
        aiCategory: null,
        aiDetails: null,
        aiGenerated: false,
      });

      // Generate AI summary for the commit with better file change detection
      let aiSummary = null;
      let aiImpact = null;
      let aiCategory = null;
      let aiDetails = null;
      let aiGenerated = false;
      let finalAdditions = commit.additions || 0;
      let finalDeletions = commit.deletions || 0;

      try {
        // Get more detailed file change information
        const filesChanged = [
          ...(commit.added || []),
          ...(commit.modified || []),
          ...(commit.removed || [])
        ];

        // Try to get actual diff stats from GitHub API if webhook data is missing
        // Note: GitHub push webhooks don't include additions/deletions in commit objects
        // Only pull request events include these fields, so we need to fetch from API for push events
        let additions = commit.additions;
        let deletions = commit.deletions;
        
        // Check if additions/deletions are actually provided in webhook (they're usually undefined for push events)
        // For push webhooks, these fields are undefined. For PR webhooks, they're provided.
        const hasWebhookStats = additions !== undefined && deletions !== undefined;

        // If we don't have diff data from webhook, try to fetch it from GitHub API
        if (!hasWebhookStats && filesChanged.length > 0) {
          try {
            // Get the repository owner and name from full_name
            const [owner, repoName] = repository.full_name.split('/');
            
            // Fetch commit details from GitHub API
            const githubResponse = await fetch(
              `https://api.github.com/repos/${owner}/${repoName}/commits/${commit.id}`,
              {
                headers: {
                  'Authorization': `token ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''}`,
                  'Accept': 'application/vnd.github.v3+json'
                }
              }
            );

            if (githubResponse.ok) {
              const commitData = await githubResponse.json();
              finalAdditions = commitData.stats?.additions || 0;
              finalDeletions = commitData.stats?.deletions || 0;
              console.log(`✅ Fetched stats from GitHub API: +${finalAdditions} -${finalDeletions}`);

            } else {
              const errorText = await githubResponse.text();
              console.error(`❌ GitHub API error: ${githubResponse.status} - ${errorText}`);
              
              // If API fails and we have webhook data, use it (even if 0)
              finalAdditions = additions || 0;
              finalDeletions = deletions || 0;
            }
          } catch (apiError) {
            console.error('Failed to fetch commit stats from GitHub API:', apiError);
            finalAdditions = additions || 0;
            finalDeletions = deletions || 0;
          }
        } else {
          // Use webhook data when available (from pull request events)
          finalAdditions = additions || 0;
          finalDeletions = deletions || 0;
        }

        const pushData = {
          repositoryName: repository.full_name,
          branch,
          commitMessage: commit.message,
          filesChanged,
          additions,
          deletions,
          commitSha: commit.id,
        };

        const aiModel = integration.aiModel || 'gpt-3.5-turbo';
        const maxTokens = integration.maxTokens || 350;
        
        const summary = await generateCodeSummary(
          pushData, 
          aiModel,
          maxTokens
        );
        aiSummary = summary.summary.summary;
        aiImpact = summary.summary.impact;
        aiCategory = summary.summary.category;
        aiDetails = summary.summary.details;
        aiGenerated = true;

        // Deduct AI credits from user
        try {
          const user = await databaseStorage.getUserById(storedRepo.userId);
          if (user) {
            const currentCredits = user.aiCredits || 0;
            const creditsToDeduct = Math.ceil(summary.tokensUsed / 10); // 1 credit per 10 tokens
            
            if (currentCredits >= creditsToDeduct) {
              const newCredits = currentCredits - creditsToDeduct;
              await databaseStorage.updateUser(user.id, { aiCredits: newCredits });
              
              // Check if credits are low (less than 50)
              if (newCredits < 50) {
                await storage.createNotification({
                  userId: user.id,
                  type: 'low_credits',
                  title: 'Low AI Credits',
                  message: `You have ${newCredits} AI credits remaining. Consider purchasing more to continue receiving AI summaries.`
                });
                
                // Broadcast notification for real-time updates
                broadcastNotification(user.id, {
                  type: 'low_credits',
                  title: 'Low AI Credits',
                  message: `You have ${newCredits} AI credits remaining. Consider purchasing more to continue receiving AI summaries.`,
                  createdAt: new Date().toISOString()
                });
              }
            } else {
              // Create notification for insufficient credits
              await storage.createNotification({
                userId: user.id,
                type: 'no_credits',
                title: 'No AI Credits',
                message: 'You have run out of AI credits. AI summaries are disabled until you purchase more credits.'
              });
              
              // Broadcast notification for real-time updates
              broadcastNotification(user.id, {
                type: 'no_credits',
                title: 'No AI Credits',
                message: 'You have run out of AI credits. AI summaries are disabled until you purchase more credits.',
                createdAt: new Date().toISOString()
              });
              
              // Skip AI processing for this push
              aiGenerated = false;
              aiSummary = null;
              aiImpact = null;
              aiCategory = null;
              aiDetails = null;
            }
          }
        } catch (creditError) {
          console.error('Error processing credits:', creditError);
          // Continue with AI processing even if credit deduction fails
        }

        // Update the push event with AI summary
        await storage.updatePushEvent(pushEvent.id, {
          aiSummary,
          aiImpact,
          aiCategory,
          aiDetails,
          aiGenerated: true,
        });
      } catch (aiError) {
        console.error('Failed to generate AI summary:', aiError);
        // Continue without AI summary
      }

              // Send Slack notification with AI summary if available
        try {
          if (aiGenerated && aiSummary) {
            // Use AI-enhanced Slack message with corrected stats
            const pushData = {
              repositoryName: repository.full_name,
              branch,
              commitMessage: commit.message,
              filesChanged: commit.added.concat(commit.modified).concat(commit.removed),
              additions: finalAdditions, // Use the corrected GitHub API data
              deletions: finalDeletions, // Use the corrected GitHub API data
              commitSha: commit.id,
            };

          const summary = { 
            summary: aiSummary!, 
            impact: aiImpact as 'low' | 'medium' | 'high', 
            category: aiCategory!, 
            details: aiDetails! 
          };
          
          const slackMessage = await generateSlackMessage(pushData, summary);
          
          await sendSlackMessage({
            channel: integration.slackChannelId,
            text: slackMessage,
            unfurl_links: false
          });
        } else {
          // Use regular push notification
          await sendPushNotification(
            integration.slackChannelId,
            repository.full_name,
            commit.message,
            commit.author.name,
            branch,
            commit.id,
            Boolean(integration.includeCommitSummaries)
          );
        }

        // Mark notification as sent
        await storage.updatePushEvent(pushEvent.id, { notificationSent: true });

        // Store push notification in database
        await storage.createNotification({
          userId: storedRepo.userId,
          type: 'push_event',
          title: 'New Push Event',
          message: `New push to ${repository.name} by ${commit.author.name}`
        });
        
        // Store Slack notification in database
        await storage.createNotification({
          userId: storedRepo.userId,
          type: 'slack_message_sent',
          title: 'Slack Message Sent',
          message: `Push notification sent to ${integration.slackChannelName} for ${repository.name}`
        });
        
        // Also broadcast via SSE for real-time updates
        const pushNotification = {
          id: `push_${pushEvent?.id || Date.now()}`,
          type: 'push_event',
          title: 'New Push Event',
          message: `New push to ${repository.name} by ${commit.author.name}`,
          createdAt: new Date().toISOString()
        };
        broadcastNotification(storedRepo.userId, pushNotification);
        
        const slackNotification = {
          id: `slack_${pushEvent?.id || Date.now()}`,
          type: 'slack_message_sent',
          title: 'Slack Message Sent',
          message: `Push notification sent to ${integration.slackChannelName} for ${repository.name}`,
          createdAt: new Date().toISOString()
        };
        broadcastNotification(storedRepo.userId, slackNotification);
      } catch (slackError) {
        console.error("Failed to send Slack notification:", slackError);
      }

      res.status(200).json({ message: "Webhook processed successfully" });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Protected route example - Get user profile
  app.get("/api/profile", authenticateToken, async (req, res) => {
    try {
      const user = await databaseStorage.getUserById(req.user!.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Validate GitHub token if user has GitHub connected
      let githubConnected = false;
      if (user.githubId && user.githubToken) {
        try {
          githubConnected = await validateGitHubToken(user.githubToken);
          
          // If token is invalid, clear the GitHub connection
          if (!githubConnected) {
            await databaseStorage.updateUser(user.id, {
              githubId: null,
              githubToken: null
            });
          }
        } catch (error) {
          console.error('GitHub token validation error:', error);
          // Clear invalid connection
          await databaseStorage.updateUser(user.id, {
            githubId: null,
            githubToken: null
          });
          githubConnected = false;
        }
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username || '',
          email: user.email || null,
          isUsernameSet: !!user.username,
          emailVerified: !!user.emailVerified,
          githubConnected,
          aiCredits: user.aiCredits || 0,
        }
      });
    } catch (error) {
      console.error("Profile error:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Get unread notifications count
  app.get("/api/notifications/unread", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      
      // Get unread notifications from database
      const unreadNotifications = await storage.getUnreadNotificationsByUserId(userId);
      
      // Get user's email verification status from JWT token first, fallback to database
      const jwtEmailVerified = req.user!.emailVerified;
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        throw new Error("User not found");
      }



      // Add email verification notification if needed and user was created via regular signup
      // Use JWT token status as it's more up-to-date than database
      let notifications = [...unreadNotifications];
      
      if (jwtEmailVerified) {
        // User is verified - remove only "Email Verification Required" notifications
        // Keep other email verification notifications like "Verification Email Resent"
        const requiredEmailNotifications = notifications.filter(n => 
          n.type === 'email_verification' && 
          n.title === 'Email Verification Required'
        );
        
        for (const notification of requiredEmailNotifications) {
          try {
            await storage.deleteNotification(notification.id);
          } catch (error) {
            console.error('Error deleting required email verification notification:', error);
          }
        }
        
        // Filter out only the required email verification notifications from the response
        notifications = notifications.filter(n => 
          !(n.type === 'email_verification' && n.title === 'Email Verification Required')
        );
      } else if (!user.githubId && !user.googleId) {
        // User is not verified and signed up via regular signup
        const emailNotificationExists = unreadNotifications.some(n => n.type === 'email_verification');
        if (!emailNotificationExists) {
          const emailNotification = await storage.createNotification({
            userId,
            type: 'email_verification',
            title: 'Email Verification Required',
            message: 'Please verify your email address to fully activate your account'
          });
          notifications.unshift(emailNotification);
        }
      }

      res.json({
        count: notifications.length,
        notifications
      });
    } catch (error) {
      console.error("Error fetching unread notifications:", error);
      res.status(500).json({ error: "Failed to fetch unread notifications" });
    }
  });

  // Get all notifications (both sent and unsent)
  app.get("/api/notifications/all", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      
      // Get all notifications from database
      const allNotifications = await storage.getNotificationsByUserId(userId);
      
      // Get user's email verification status from JWT token first, fallback to database
      const jwtEmailVerified = req.user!.emailVerified;
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      // Add email verification notification if needed and user was created via regular signup
      // Use JWT token status as it's more up-to-date than database
      let notifications = [...allNotifications];
      
      if (jwtEmailVerified) {
        // User is verified - remove only "Email Verification Required" notifications
        // Keep other email verification notifications like "Verification Email Resent"
        const requiredEmailNotifications = notifications.filter(n => 
          n.type === 'email_verification' && 
          n.title === 'Email Verification Required'
        );
        
        for (const notification of requiredEmailNotifications) {
          try {
            await storage.deleteNotification(notification.id);
          } catch (error) {
            console.error('Error deleting required email verification notification:', error);
          }
        }
        
        // Filter out only the required email verification notifications from the response
        notifications = notifications.filter(n => 
          !(n.type === 'email_verification' && n.title === 'Email Verification Required')
        );
      } else if (!user.githubId && !user.googleId) {
        // User is not verified and signed up via regular signup
        const emailNotificationExists = allNotifications.some(n => n.type === 'email_verification');
        if (!emailNotificationExists) {
          const emailNotification = await storage.createNotification({
            userId,
            type: 'email_verification',
            title: 'Email Verification Required',
            message: 'Please verify your email address to fully activate your account'
          });
          notifications.unshift(emailNotification);
        }
      }

      // Sort notifications by createdAt (newest first)
      notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({
        count: notifications.length,
        notifications
      });
    } catch (error) {
      console.error("Error fetching all notifications:", error);
      res.status(500).json({ error: "Failed to fetch all notifications" });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/mark-read", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notifications as read:", error);
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });

  // Clear all notifications for a user (MUST come before /:id route)
  app.delete("/api/notifications/clear-all", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;
      
      // Get current notification count before deletion
      const currentNotifications = await storage.getNotificationsByUserId(userId);
      
      // Delete all notifications
      const result = await storage.deleteAllNotifications(userId);
      
      // Verify deletion by checking count again
      const remainingNotifications = await storage.getNotificationsByUserId(userId);
      
      res.json({ success: true, deletedCount: currentNotifications.length });
    } catch (error) {
      console.error("❌ [SERVER] Error clearing notifications:", error);
      res.status(500).json({ error: "Failed to clear notifications" });
    }
  });

  // Delete a specific notification
  app.delete("/api/notifications/:id", authenticateToken, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      const userId = req.user!.userId;
      
      // Get all user notifications to verify ownership
      const userNotifications = await storage.getNotificationsByUserId(userId);
      const notification = userNotifications.find(n => n.id === notificationId);
      
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      const success = await storage.deleteNotification(notificationId);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Notification not found" });
      }
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // Server-Sent Events endpoint for real-time notifications
  app.get("/api/notifications/stream", (req, res) => {
    // Get token from query parameter for SSE
    const token = req.query.token as string;
    if (!token) {
      return res.status(401).json({ error: "Token required" });
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userId = decoded.userId;
    
    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

    // Store the response object for this user
    if (!global.notificationStreams) {
      global.notificationStreams = new Map();
    }
    global.notificationStreams!.set(userId, res);

    // Handle client disconnect
    req.on('close', () => {
      global.notificationStreams?.delete(userId);
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
    }, 30000); // Send heartbeat every 30 seconds

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  });

  // Add forgot password endpoint
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json("Email is required");
      }

      // Find user by email
      const user = await databaseStorage.getUserByEmail(email);

      // Don't reveal whether a user exists or not
      if (!user) {
        return res.status(200).json({ 
          success: true,
          message: "If an account exists with this email, you will receive a password reset link."
        });
      }

      // Generate reset token
      const resetPasswordToken = crypto.randomBytes(32).toString('hex');
      const resetPasswordTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      // Update user with reset token
      await databaseStorage.updateUser(user.id, {
        resetPasswordToken,
        resetPasswordTokenExpiry,
      });

      // Send password reset email
      await sendPasswordResetEmail(email, resetPasswordToken);

      res.status(200).json({
        success: true,
        message: "If an account exists with this email, you will receive a password reset link."
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json("Failed to process request");
    }
  });

  // Add reset password endpoint
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json("Token and password are required");
      }

      // Find user by reset token
      const user = await databaseStorage.getUserByResetToken(token);

      if (!user) {
        return res.status(400).json("Invalid or expired reset token");
      }

      // Check if token is expired
      if (user.resetPasswordTokenExpiry && new Date(user.resetPasswordTokenExpiry) < new Date()) {
        return res.status(400).json("Reset token has expired");
      }

      // Check if new password is same as old password
      if (user.password) {
        const isSamePassword = await bcrypt.compare(password, user.password);
        if (isSamePassword) {
          return res.status(400).json("New password must be different from your old password");
        }
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // Update user with new password and clear reset token
      await databaseStorage.updateUser(user.id, {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordTokenExpiry: null
      });

      res.status(200).json({
        success: true,
        message: "Password has been reset successfully"
      });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json("Failed to reset password");
    }
  });

  // Payment routes
  app.post("/api/payments/create-payment-intent", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.userId;
      const { packageId } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!packageId) {
        return res.status(400).json({ error: "Package ID is required" });
      }

      // Get user
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Create or get Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await createStripeCustomer(user.email || '', user.username || '');
        customerId = customer.id;
        await databaseStorage.updateUser(userId, { stripeCustomerId: customerId });
      }

      // Create payment intent
      const paymentIntent = await createPaymentIntent(customerId as string, packageId);

      res.json({
        clientSecret: paymentIntent.client_secret,
        url: (paymentIntent as any).url
      });
    } catch (error) {
      console.error("Create payment intent error:", error);
      res.status(500).json({ error: "Failed to create payment intent" });
    }
  });

  // Test payment processing endpoint (for development/testing)
  app.post("/api/payments/process-test-payment", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.userId;
      const { paymentIntentId, packageId, cardDetails } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Validate test card number
      if (cardDetails.number.replace(/\s/g, '') !== '4242424242424242') {
        return res.status(400).json({ error: "Invalid test card number. Use 4242 4242 4242 4242" });
      }

      // Get user
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get package info
      const creditPackage = CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
      if (!creditPackage) {
        return res.status(400).json({ error: "Invalid package" });
      }

      // Add credits to user
      const newCredits = (user.aiCredits || 0) + creditPackage.credits;
      await databaseStorage.updateUser(userId, {
        aiCredits: newCredits
      });

      // Record payment
      await databaseStorage.createPayment({
        userId: userId,
        stripePaymentIntentId: `test_${Date.now()}`,
        amount: creditPackage.price,
        credits: creditPackage.credits,
        status: 'succeeded'
      });

      res.json({
        success: true,
        creditsAdded: creditPackage.credits,
        newBalance: newCredits
      });
    } catch (error) {
      console.error("Test payment error:", error);
      res.status(500).json({ error: "Failed to process test payment" });
    }
  });

  // Stripe webhook for payment confirmation
  app.post("/api/payments/webhook", async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      console.error("Stripe webhook secret not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      
      try {
        // Get user by customer ID
        const user = await databaseStorage.getUserByStripeCustomerId(paymentIntent.customer as string);
        if (!user) {
          console.error("User not found for customer:", paymentIntent.customer);
          return res.status(404).json({ error: "User not found" });
        }

        // Get package info from metadata
        const packageId = paymentIntent.metadata.packageId;
        const credits = parseInt(paymentIntent.metadata.credits);

        // Add credits to user
        await databaseStorage.updateUser(user.id, {
          aiCredits: (user.aiCredits || 0) + credits
        });

        // Record payment
        await databaseStorage.createPayment({
          userId: user.id,
          stripePaymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          credits: credits,
          status: 'succeeded'
        });
      } catch (error) {
        console.error("Error processing payment:", error);
        return res.status(500).json({ error: "Failed to process payment" });
      }
    }

    res.json({ received: true });
  });

  const httpServer = createServer(app);
  return httpServer;
}
