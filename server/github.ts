import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the project root (one level up from server directory)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string | null;
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  default_branch: string;
  private: boolean;
}

interface GitHubWebhook {
  id: number;
  name: string;
  active: boolean;
  events: string[];
  config: {
    url: string;
    content_type: string;
  };
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const clientId = process.env.VITE_GITHUB_CLIENT_ID || "Iv23lixttif7N6Na9P9b";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth credentials not configured");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description}`);
  }

  return data.access_token;
}

/**
 * Get user information from GitHub
 */
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  // First get the user profile
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/vnd.github.v3+json",
    },
  });

  if (!userResponse.ok) {
    throw new Error(`GitHub API error: ${userResponse.statusText}`);
  }

  const userData = await userResponse.json();

  // Then get the user's emails
  const emailResponse = await fetch("https://api.github.com/user/emails", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/vnd.github.v3+json",
    },
  });

  if (!emailResponse.ok) {
    throw new Error(`GitHub API error: ${emailResponse.statusText}`);
  }

  const emails = await emailResponse.json();
  
  // Find the primary email
  const primaryEmail = emails.find((email: any) => email.primary)?.email || emails[0]?.email;

  // Return combined user data
  return {
    ...userData,
    email: primaryEmail || null,
  };
}

/**
 * Get user's repositories from GitHub
 */
export async function getUserRepositories(accessToken: string): Promise<GitHubRepository[]> {
  const response = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Create a webhook for a repository using OAuth token or fallback to PAT
 */
export async function createWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  webhookUrl: string
): Promise<GitHubWebhook> {
  // Debug: Check if PAT is available
  const pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  console.log('createWebhook called with PAT available:', {
    hasPat: !!pat,
    patLength: pat ? pat.length : 0,
    patPrefix: pat ? pat.substring(0, 4) : 'none'
  });
  // Try with OAuth token first
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push"],
        config: {
          url: webhookUrl,
          content_type: "json",
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('GitHub webhook creation error with OAuth token:', {
        status: response.status,
        statusText: response.statusText,
        error: error,
        owner,
        repo,
        webhookUrl
      });
      // This will trigger the catch block
      throw new Error(`Failed to create webhook: ${error.message || error.error || response.statusText}`);
    }

    return await response.json();
  } catch (oauthError) {
    // If OAuth fails, try with PAT if available
    const pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    console.log('OAuth webhook creation failed, checking for PAT...', {
      hasPat: !!pat,
      patLength: pat ? pat.length : 0,
      patPrefix: pat ? pat.substring(0, 4) : 'none'
    });
    if (pat) {
      console.log('OAuth webhook creation failed, trying with PAT...');
      try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${pat}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "web",
            active: true,
            events: ["push"],
            config: {
              url: webhookUrl,
              content_type: "json",
            },
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error('GitHub webhook creation error with PAT:', {
            status: response.status,
            statusText: response.statusText,
            error: error,
            owner,
            repo,
            webhookUrl
          });
          throw new Error(`Failed to create webhook with PAT: ${error.message || error.error || response.statusText}`);
        }

        return await response.json();
      } catch (patError) {
        console.error('Both OAuth and PAT webhook creation failed:', { oauthError, patError });
        throw oauthError; // Throw the original OAuth error
      }
    } else {
      throw oauthError; // No PAT available, throw original error
    }
  }
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  webhookId: string
): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/vnd.github.v3+json",
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete webhook: ${response.statusText}`);
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  // const crypto = require('crypto'); // Changed to import at top of file
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}
