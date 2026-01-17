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
  // Use OAuth App credentials for user authentication
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_CLIENT_ID || "Ov23li5UgB18JcaZHnxk";
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("GitHub OAuth configuration error:", {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      oauthClientIdEnv: process.env.GITHUB_OAUTH_CLIENT_ID ? "set" : "missing",
      oauthClientSecretEnv: process.env.GITHUB_OAUTH_CLIENT_SECRET ? "set" : "missing",
      fallbackClientIdEnv: process.env.GITHUB_CLIENT_ID ? "set" : "missing",
      fallbackClientSecretEnv: process.env.GITHUB_CLIENT_SECRET ? "set" : "missing"
    });
    throw new Error("GitHub OAuth credentials not configured. Please check GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET environment variables.");
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
    console.error("GitHub OAuth token exchange error:", {
      error: data.error,
      error_description: data.error_description,
      error_uri: data.error_uri
    });
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }

  if (!data.access_token) {
    console.error("GitHub OAuth response missing access_token:", data);
    throw new Error("GitHub OAuth response missing access token");
  }

  // Log the scopes returned by GitHub
  console.log("GitHub OAuth token exchange successful. Scopes granted:", data.scope || "none");
  console.log("Full GitHub OAuth response:", JSON.stringify(data, null, 2));
  
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
 * Get the scopes for a GitHub access token
 */
export async function getGitHubTokenScopes(accessToken: string): Promise<string[]> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });

    const scopesHeader = response.headers.get("x-oauth-scopes");
    if (scopesHeader) {
      return scopesHeader.split(", ").map(s => s.trim());
    }
    return [];
  } catch (error) {
    console.error('Error getting GitHub token scopes:', error);
    return [];
  }
}

/**
 * Validate if a GitHub access token is still valid
 */
export async function validateGitHubToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });

    return response.ok;
  } catch (error) {
    console.error('GitHub token validation error:', error);
    return false;
  }
}

/**
 * Get user's repositories from GitHub (including organization repos)
 */
export async function getUserRepositories(accessToken: string): Promise<GitHubRepository[]> {
  // Check token scopes first
  const scopes = await getGitHubTokenScopes(accessToken);
  console.log(`GitHub token scopes: ${scopes.join(", ")}`);
  
  const hasRepoScope = scopes.includes("repo");
  if (!hasRepoScope) {
    console.warn("⚠️  WARNING: GitHub token does not have 'repo' scope. Private repos will not be accessible.");
    console.warn("⚠️  User needs to re-authenticate with GitHub to get 'repo' scope.");
  }

  const allRepos: GitHubRepository[] = [];
  let page = 1;
  
  // Fetch all pages of repos with affiliation parameter to include org repos
  // Note: affiliation already includes all repos (public and private) if token has 'repo' scope
  while (true) {
    const response = await fetch(
      `https://api.github.com/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/vnd.github.v3+json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GitHub API error: ${response.status} ${response.statusText}`, errorText);
      
      // If 403 and no repo scope, provide helpful error
      if (response.status === 403 && !hasRepoScope) {
        throw new Error("GitHub token missing 'repo' scope. Please reconnect your GitHub account to grant access to private repositories.");
      }
      
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const repos = await response.json();
    if (repos.length === 0) break;
    
    allRepos.push(...repos);
    if (repos.length < 100) break; // Last page
    page++;
  }
  
  return allRepos;
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
    if (pat) {
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
