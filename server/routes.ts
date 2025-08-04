import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from 'bcryptjs';
import { generateToken, verifyToken } from './jwt';
import { authenticateToken } from './middleware/auth';
import { 
  exchangeCodeForToken, 
  getGitHubUser, 
  getUserRepositories, 
  createWebhook,
  deleteWebhook,
  verifyWebhookSignature,
  validateGitHubToken
} from "./github";
import { exchangeGoogleCodeForToken, getGoogleUser } from "./google";
import { 
  sendPushNotification, 
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
import crypto from 'crypto';

// Extend global type for notification streams
declare global {
  var notificationStreams: Map<number, any> | undefined;
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
  // Login route
  app.post("/api/login", async (req, res) => {
    try {
      const { identifier, password } = req.body;

      if (!identifier || !password) {
        return res.status(400).send("Email/username and password are required");
      }

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
      console.log("Login error:", error);
      res.status(500).send("An error occurred while trying to log in");
    }
  });

  // Add GitHub connection initiation endpoint
  app.get("/api/github/connect", authenticateToken, async (req, res) => {
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
            return res.status(400).json({
              error: "GitHub account already connected"
            });
          } else {
            // Token is invalid, clear the connection and allow reconnection
            console.log(`Invalid GitHub token for user ${userId}, allowing reconnection`);
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

      // Build the GitHub OAuth URL
      const clientId = process.env.GITHUB_CLIENT_ID || "Iv23lixttif7N6Na9P9b";
      const redirectUri = process.env.APP_URL ? `${process.env.APP_URL}/api/auth/user` : "https://7e6d-32-141-233-130.ngrok-free.app/api/auth/user";
      const scope = "repo user:email admin:org_hook";
      
      const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
      
      // Instead of redirecting, send the URL and state back to the client
      res.json({ url, state });
    } catch (error) {
      console.error('GitHub connection initiation failed:', error);
      res.status(500).json({ error: 'Failed to initiate GitHub connection' });
    }
  });

  // Get current user info or handle GitHub OAuth
  app.get("/api/auth/user", async (req, res) => {
    try {
      // Check if this is a GitHub OAuth callback
      const code = req.query.code as string;
      if (code) {
        // Handle GitHub OAuth
        const token = await exchangeCodeForToken(code);
        const githubUser = await getGitHubUser(token);

        console.log('GitHub user data:', {
          id: githubUser.id,
          login: githubUser.login,
          email: githubUser.email
        });

        // Try to find existing user by GitHub ID or email
        let user = await databaseStorage.getUserByGithubId(githubUser.id.toString());
        console.log('Found user by GitHub ID:', user);
        
        if (!user && githubUser.email) {
          user = await databaseStorage.getUserByEmail(githubUser.email);
          console.log('Found user by email:', user);
        }

        if (!user) {
          console.log('Creating new user...');
          // Create new user if they don't exist
          user = await databaseStorage.createUser({
            username: githubUser.login,
            email: githubUser.email,
            githubId: githubUser.id.toString(),
            githubToken: token,
            emailVerified: true // GitHub users are considered verified
          });
          console.log('Created new user:', user);
        } else {
          console.log('Updating existing user...');
          // Update existing user's GitHub connection
          user = await databaseStorage.updateUser(user.id, {
            githubId: githubUser.id.toString(),
            githubToken: token,
            email: githubUser.email || user.email,
            emailVerified: true, // Mark as verified since we have GitHub email
            username: user.username || githubUser.login // Keep existing username if set, otherwise use GitHub username
          });
          console.log('Updated user:', user);
        }

        if (!user || !user.id) {
          throw new Error('Failed to create or update user properly');
        }

        if (!user) {
          throw new Error("Failed to create or update user");
        }

        console.log('GitHub OAuth successful. User details:', {
          userId: user.id,
          username: user.username,
          githubId: user.githubId
        });

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
      res.status(500).json({ error: "Authentication failed" });
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

      if (!user) {
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

        // Create new user if they don't exist
        user = await databaseStorage.createUser({
          username: username, // Use the unique username we generated
          email: googleUser.email,
          googleId: googleUser.id,
          googleToken: token,
        });
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
  app.post("/api/signup", async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).send("Username, email, and password are required");
      }

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
      console.log("Signup error:", error);
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
  app.get("/api/repositories", authenticateToken, async (req, res) => {
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
          return res.status(401).json({ error: "GitHub token has expired. Please reconnect your GitHub account." });
        }
      } catch (validationError) {
        console.error("GitHub token validation error:", validationError);
        // Clear invalid connection
        await databaseStorage.updateUser(userId, {
          githubId: null,
          githubToken: null
        });
        return res.status(401).json({ error: "GitHub token has expired. Please reconnect your GitHub account." });
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
            isConnected: !!connectedRepo
          };
        });

        res.json(enrichedRepos);
      } catch (githubError) {
        console.error("Failed to fetch GitHub repositories:", githubError);
        return res.status(404).json({ error: "No repositories found. Please check your GitHub connection." });
      }
    } catch (error) {
      console.error("Failed to fetch repositories:", error);
      res.status(500).json({ error: "Failed to fetch repositories" });
    }
  });

  // Connect a repository
  app.post("/api/repositories", async (req, res) => {
    try {
      console.log('Repository connection request:', {
        body: req.body,
        headers: {
          authorization: !!req.headers.authorization,
          contentType: req.headers['content-type']
        }
      });

      const schema = insertRepositorySchema.extend({
        userId: z.number(),
      });

      const validatedData = schema.parse(req.body);
      
      // Log storage type
      console.log('Using database storage');
      
      const user = await storage.getUser(validatedData.userId);

      console.log('Connecting repository for user:', {
        userId: validatedData.userId,
        hasUser: !!user,
        githubId: user?.githubId,
        hasGithubToken: !!user?.githubToken,
        userDetails: user
      });
      
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      if (!user.githubId || !user.githubToken) {
        return res.status(401).json({ error: "GitHub not connected. Please try refreshing your GitHub connection." });
      }

      // Create webhook URL
      const domain = process.env.APP_URL || "https://7e6d-32-141-233-130.ngrok-free.app";
      const webhookUrl = `${domain}/api/webhooks/github`;
      console.log(`github webhookURL: ${webhookUrl}`)

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
        console.log('Repository access confirmed:', {
          name: repoData.name,
          permissions: repoData.permissions,
          private: repoData.private
        });

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
          webhookId: webhook.id.toString(),
        });

        res.json(repository);
      } catch (webhookError) {
        console.error("Webhook creation failed:", webhookError);
        
        // Provide more specific error message
        const errorMessage = webhookError instanceof Error ? webhookError.message : "Unknown error occurred";
        
        // Still create the repository without webhook, but inform the user
        const repository = await storage.createRepository(validatedData);
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

  // Get Slack channels
  app.get("/api/slack/channels", async (req, res) => {
    try {
      const channels = await getSlackChannels();
      res.json(channels);
    } catch (error) {
      console.error("Error fetching Slack channels:", error);
      res.status(500).json({ error: "Failed to fetch Slack channels" });
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
  app.get("/api/slack/connect", authenticateToken, async (req, res) => {
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

      // Build the Slack OAuth URL
      const url = generateSlackOAuthUrl(state);
      
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

      // Redirect to dashboard with success
      res.redirect(`/dashboard#slack=connected`);
    } catch (error) {
      console.error('Slack OAuth callback error:', error);
      res.redirect(`/dashboard#error=${encodeURIComponent('Failed to connect Slack workspace')}`);
    }
  });

  // Get user's Slack workspaces
  app.get("/api/slack/workspaces", authenticateToken, async (req, res) => {
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
  app.get("/api/slack/workspaces/:workspaceId/channels", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.userId;
      const workspaceId = parseInt(req.params.workspaceId);
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const workspace = await databaseStorage.getSlackWorkspace(workspaceId);
      
      if (!workspace || workspace.userId !== userId) {
        return res.status(404).json({ error: "Workspace not found" });
      }

      const channels = await getSlackChannelsForWorkspace(workspace.accessToken);
      res.json(channels);
    } catch (error) {
      console.error('Error fetching Slack channels:', error);
      res.status(500).json({ error: 'Failed to fetch Slack channels' });
    }
  });

  // Create integration
  app.post("/api/integrations", async (req, res) => {
    try {
      const validatedData = insertIntegrationSchema.parse(req.body);
      const integration = await storage.createIntegration(validatedData);
      res.json(integration);
    } catch (error) {
      console.error("Error creating integration:", error);
      res.status(400).json({ error: "Invalid integration data" });
    }
  });

  // Get user integrations
  app.get("/api/integrations", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      const integrations = await storage.getIntegrationsByUserId(parseInt(userId));
      
      // Debug: Log all repositories
      const allRepositories = await storage.getRepositoriesByUserId(parseInt(userId));
      
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
            status: integration.isActive ? 'active' : 'paused'
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
  app.patch("/api/integrations/:id", async (req, res) => {
    try {
      const integrationId = parseInt(req.params.id);
      const updates = req.body;
      
      const integration = await storage.updateIntegration(integrationId, updates);
      
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      res.json(integration);
    } catch (error) {
      console.error("Error updating integration:", error);
      res.status(500).json({ error: "Failed to update integration" });
    }
  });

  // Delete integration
  app.delete("/api/integrations/:id", async (req, res) => {
    try {
      const integrationId = parseInt(req.params.id);
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
  
  // Disconnect a repository
  app.delete("/api/repositories/:id", async (req, res) => {
    try {
      const repositoryId = parseInt(req.params.id);
      const repository = await storage.getRepository(repositoryId);
      
      if (!repository) {
        return res.status(404).json({ error: "Repository not found" });
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

  // Get user stats
  app.get("/api/stats", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      const stats = await storage.getStatsForUser(parseInt(userId));
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Get push events
  app.get("/api/push-events", async (req, res) => {
    try {
      const repositoryId = req.query.repositoryId as string;
      
      if (!repositoryId) {
        return res.status(400).json({ error: "Repository ID required" });
      }

      const pushEvents = await storage.getPushEventsByRepositoryId(parseInt(repositoryId));
      res.json(pushEvents);
    } catch (error) {
      console.error("Error fetching push events:", error);
      res.status(500).json({ error: "Failed to fetch push events" });
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

      const { repository, commits, ref, pusher } = req.body;
      
      if (!repository || !commits || commits.length === 0) {
        return res.status(200).json({ message: "No commits to process" });
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

      // Extract branch name from ref
      const branch = ref.replace('refs/heads/', '');
      
      // Check notification level
      if (integration.notificationLevel === 'main_only' && branch !== storedRepo.branch) {
        return res.status(200).json({ message: "Branch filtered out" });
      }

      // Process each commit
      for (const commit of commits) {
        // Store push event
        await storage.createPushEvent({
          repositoryId: storedRepo.id,
          integrationId: integration.id,
          commitSha: commit.id,
          commitMessage: commit.message,
          author: commit.author.name,
          branch,
          pushedAt: new Date(commit.timestamp),
          notificationSent: false,
        });

        // Send Slack notification
        try {
          await sendPushNotification(
            integration.slackChannelId,
            repository.full_name,
            commit.message,
            commit.author.name,
            branch,
            commit.id,
            Boolean(integration.includeCommitSummaries)
          );

          // Mark notification as sent
          const pushEvent = await storage.getPushEvent(commit.id);
          
          if (pushEvent) {
            await storage.updatePushEvent(pushEvent.id, { notificationSent: true });
          }

          // Broadcast notification to connected clients
          const notification = {
            id: `push_${pushEvent?.id || Date.now()}`,
            type: 'push_event',
            message: `New push to ${repository.name} by ${commit.author.name}`,
            createdAt: new Date().toISOString()
          };
          broadcastNotification(storedRepo.userId, notification);
        } catch (slackError) {
          console.error("Failed to send Slack notification:", slackError);
        }
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
            console.log(`Invalid GitHub token for user ${user.id}, clearing connection`);
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
          isUsernameSet: true,
          verifiedEmail: true,
          githubConnected
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
      
      // Get user's repositories
      const repositories = await storage.getRepositoriesByUserId(userId);
      
      // Get user's email verification status
      const user = await databaseStorage.getUserById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Get unread push event notifications
      const pushNotifications = (await Promise.all(
        repositories.map(async (repo) => {
          const events = await storage.getPushEventsByRepositoryId(repo.id);
          return events
            .filter(event => !event.notificationSent)
            .map(event => ({
              id: `push_${event.id}`,
              type: 'push_event',
              message: `New push to ${repo.name} by ${event.author}`,
              createdAt: new Date(event.pushedAt).toISOString()
            }));
        })
      )).flat();

      // Add email verification notification if needed and user was created via regular signup
      const notifications = [...pushNotifications];
      if (!user.emailVerified && !user.githubId && !user.googleId) {
        notifications.unshift({
          id: `email_${userId}`,
          type: 'email_verification',
          message: 'Please verify your email address to fully activate your account',
          createdAt: new Date(user.createdAt || Date.now()).toISOString()
        });
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

  const httpServer = createServer(app);
  return httpServer;
}
