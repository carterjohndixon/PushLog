import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { 
  exchangeCodeForToken, 
  getGitHubUser, 
  getUserRepositories, 
  createWebhook,
  deleteWebhook,
  verifyWebhookSignature 
} from "./github";
import { 
  sendPushNotification, 
  getSlackChannels, 
  testSlackConnection 
} from "./slack";
import { insertIntegrationSchema, insertRepositorySchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // GitHub OAuth callback
  app.post("/api/auth/github", async (req, res) => {
    try {
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({ error: "Authorization code required" });
      }

      const accessToken = await exchangeCodeForToken(code);
      const githubUser = await getGitHubUser(accessToken);
      
      // Find or create user
      let user = await storage.getUserByGithubId(githubUser.id.toString());
      
      if (!user) {
        user = await storage.createUser({
          username: githubUser.login,
          password: "", // OAuth users don't need passwords
        });
      }

      // Update user with GitHub info
      await storage.updateUser(user.id, {
        githubId: githubUser.id.toString(),
        githubToken: accessToken,
      });

      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          username: user.username,
          githubId: user.githubId 
        } 
      });
    } catch (error) {
      console.error("GitHub OAuth error:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  // Get user's GitHub repositories
  app.get("/api/repositories", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      const user = await storage.getUser(parseInt(userId));
      if (!user || !user.githubToken) {
        return res.status(401).json({ error: "GitHub not connected" });
      }

      const githubRepos = await getUserRepositories(user.githubToken);
      const storedRepos = await storage.getRepositoriesByUserId(user.id);

      // Merge GitHub data with stored repository data
      const repositories = githubRepos.map(githubRepo => {
        const storedRepo = storedRepos.find(r => r.githubId === githubRepo.id.toString());
        return {
          id: storedRepo?.id,
          githubId: githubRepo.id.toString(),
          name: githubRepo.name,
          fullName: githubRepo.full_name,
          owner: githubRepo.owner.login,
          branch: githubRepo.default_branch,
          isActive: storedRepo?.isActive ?? false,
          isConnected: !!storedRepo,
          private: githubRepo.private,
        };
      });

      res.json(repositories);
    } catch (error) {
      console.error("Error fetching repositories:", error);
      res.status(500).json({ error: "Failed to fetch repositories" });
    }
  });

  // Connect a repository
  app.post("/api/repositories", async (req, res) => {
    try {
      const schema = insertRepositorySchema.extend({
        userId: z.number(),
      });

      const validatedData = schema.parse(req.body);
      const user = await storage.getUser(validatedData.userId);
      
      if (!user || !user.githubToken) {
        return res.status(401).json({ error: "GitHub not connected" });
      }

      // Create webhook URL
      const domains = process.env.REPLIT_DOMAINS?.split(',') || ['localhost:5000'];
      const webhookUrl = `https://${domains[0]}/api/webhooks/github`;

      try {
        const webhook = await createWebhook(
          user.githubToken,
          validatedData.owner,
          validatedData.name,
          webhookUrl
        );

        const repository = await storage.createRepository({
          ...validatedData,
          webhookId: webhook.id.toString(),
        });

        res.json(repository);
      } catch (webhookError) {
        console.error("Webhook creation failed:", webhookError);
        // Still create the repository without webhook
        const repository = await storage.createRepository(validatedData);
        res.json(repository);
      }
    } catch (error) {
      console.error("Error connecting repository:", error);
      res.status(400).json({ error: "Invalid repository data" });
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
      res.json(integrations);
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
          const pushEvent = Array.from(storage['pushEvents'].values())
            .find(event => event.commitSha === commit.id);
          
          if (pushEvent) {
            await storage.updatePushEvent(pushEvent.id, { notificationSent: true });
          }
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

  const httpServer = createServer(app);
  return httpServer;
}
