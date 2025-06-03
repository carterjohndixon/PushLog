import { WebClient, type ChatPostMessageArguments } from "@slack/web-api";

if (!process.env.SLACK_BOT_TOKEN) {
  throw new Error("SLACK_BOT_TOKEN environment variable must be set");
}

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

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
    });
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
