import { WebClient, type ChatPostMessageArguments } from "@slack/web-api";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.SLACK_BOT_TOKEN) {
  throw new Error("SLACK_BOT_TOKEN environment variable must be set");
}

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * Generate Slack OAuth URL for workspace connection
 */
export function generateSlackOAuthUrl(state: string, isPopup: boolean = false): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.APP_URL ? `${process.env.APP_URL}/api/slack/callback` : "https://pushlog.ai/api/slack/callback";
  
  if (!clientId) {
    throw new Error("SLACK_CLIENT_ID environment variable must be set");
  }

  const scope = "chat:write,channels:read,groups:read,team:read";
  
  // Add popup parameter to redirect URI so callback knows it's in a popup
  const finalRedirectUri = isPopup ? `${redirectUri}?popup=true` : redirectUri;
  
  return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(finalRedirectUri)}&state=${state}`;
}

/**
 * Exchange Slack OAuth code for access token
 */
export async function exchangeSlackCodeForToken(code: string): Promise<{
  access_token: string;
  team: {
    id: string;
    name: string;
  };
  authed_user: {
    id: string;
  };
}> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.APP_URL ? `${process.env.APP_URL}/api/slack/callback` : "https://pushlog.ai/api/slack/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Slack OAuth credentials not configured");
  }

  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();
  
  if (!data.ok) {
    throw new Error(`Slack OAuth error: ${data.error}`);
  }

  return data;
}

/**
 * Get Slack workspace info
 */
export async function getSlackWorkspaceInfo(accessToken: string): Promise<{
  team: {
    id: string;
    name: string;
    domain: string;
  };
}> {
  const client = new WebClient(accessToken);
  const response = await client.team.info();
  
  if (!response.ok) {
    throw new Error(`Failed to get workspace info: ${response.error}`);
  }

  return response as any;
}

/**
 * Sends a welcome message when an integration is first created
 */
export async function sendIntegrationWelcomeMessage(
  channelId: string,
  repositoryName: string,
  integrationName: string
): Promise<string | undefined> {
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🎉 *Integration Created Successfully!*`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Your PushLog integration is now active and ready to receive notifications.`
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Repository:*\n${repositoryName}`
        },
        {
          type: "mrkdwn",
          text: `*Integration:*\n${integrationName}`
        }
      ]
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📡 *What happens next?*\n• You'll receive notifications for all future pushes to this repository\n• Each notification will include commit details and AI-generated summaries\n• You can manage this integration from your PushLog dashboard`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "💡 Tip: You can pause or delete this integration anytime from your dashboard"
        }
      ]
    }
  ];

  return await sendSlackMessage({
    channel: channelId,
    blocks,
    text: `PushLog integration created for ${repositoryName}` // Fallback text
  });
}

/**
 * Sends a structured message to a Slack channel using the Slack Web API
 */
export async function sendSlackMessage(
  message: ChatPostMessageArguments
): Promise<string | undefined> {
  try {
    const response = await slack.chat.postMessage(message);
    return response.ts;
  } catch (error) {
    console.error('Error sending Slack message:', error);
    throw error;
  }
}

/**
 * Send a formatted push notification to Slack
 */
export async function sendPushNotification(
  channelId: string,
  repositoryName: string,
  commitMessage: string,
  author: string,
  branch: string,
  commitSha: string,
  includeCommitSummary: boolean = true
): Promise<string | undefined> {
  const commitUrl = `https://github.com/${repositoryName}/commit/${commitSha}`;
  
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🌳 *New push to ${repositoryName}* on \`${branch}\``
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Author:*\n${author}`
        },
        {
          type: "mrkdwn",
          text: `*Commit:*\n<${commitUrl}|${commitSha.substring(0, 7)}>`
        }
      ]
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Message:*\n${commitMessage}`
      }
    }
  ];

  if (includeCommitSummary) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "📝 AI Summary: Code changes detected in repository structure and functionality"
        }
      ]
    } as any);
  }

  return await sendSlackMessage({
    channel: channelId,
    blocks,
    text: `New push to ${repositoryName} by ${author}` // Fallback text
  });
}

/**
 * Get list of channels in the workspace
 */
export async function getSlackChannels(): Promise<any[]> {
  try {
    const response = await slack.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true
    });
    
    return response.channels || [];
  } catch (error) {
    console.error('Error fetching Slack channels:', error);
    throw error;
  }
}

/**
 * Get list of channels in a specific workspace
 */
export async function getSlackChannelsForWorkspace(accessToken: string): Promise<any[]> {
  try {
    const client = new WebClient(accessToken);
    const response = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true
    });
    
    return response.channels || [];
  } catch (error) {
    console.error('Error fetching Slack channels for workspace:', error);
    throw error;
  }
}

/**
 * Test Slack connection
 */
export async function testSlackConnection(): Promise<boolean> {
  try {
    const response = await slack.auth.test();
    return response.ok === true;
  } catch (error) {
    console.error('Error testing Slack connection:', error);
    return false;
  }
}
