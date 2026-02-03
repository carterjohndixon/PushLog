import crypto from "crypto";

export type SlackCommandPayload = {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id?: string;
};

/**
 * Verify that a request is from Slack using the signing secret.
 * Uses raw body and X-Slack-Request-Timestamp per Slack docs:
 * https://api.slack.com/authentication/verifying-requests-from-slack
 * Basestring is v0:{timestamp}:{body}, not v0:{body}.
 */
export function verifySlackRequest(
  rawBody: string | Buffer,
  signature: string | undefined,
  signingSecret: string,
  timestampHeader?: string
): boolean {
  if (!signature || !signingSecret) return false;
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const timestamp = timestampHeader?.trim() || "";
  if (!timestamp) return false;
  // Replay protection: reject if older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(now - ts) > 60 * 5) return false;
  const [version, hash] = signature.split("=");
  if (version !== "v0" || !hash) return false;
  const sigBasestring = `v0:${timestamp}:${body}`;
  const expected = "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Parse application/x-www-form-urlencoded body into SlackCommandPayload
 */
export function parseSlackCommandBody(body: string): SlackCommandPayload {
  const params = new URLSearchParams(body);
  return {
    token: params.get("token") ?? "",
    team_id: params.get("team_id") ?? "",
    team_domain: params.get("team_domain") ?? "",
    channel_id: params.get("channel_id") ?? "",
    channel_name: params.get("channel_name") ?? "",
    user_id: params.get("user_id") ?? "",
    user_name: params.get("user_name") ?? "",
    command: params.get("command") ?? "",
    text: params.get("text") ?? "",
    response_url: params.get("response_url") ?? "",
    trigger_id: params.get("trigger_id") ?? undefined,
  };
}

/** Human-readable label for AI model (server-side, no client import). */
function modelLabel(modelId: string | null | undefined): string {
  if (modelId == null || modelId === "") return "—";
  if (modelId.includes("/")) {
    const [provider, model] = modelId.split("/");
    const p = provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
    const m = model.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return `${p}: ${m}`;
  }
  return modelId;
}

/**
 * Build the response for a slash command. Returns JSON to send to Slack.
 * Handles: /pushlog, /pushlog-model, /pushlog-status, /pushlog-help
 */
export async function handleSlackCommand(
  payload: SlackCommandPayload,
  getIntegrationsForChannel: (teamId: string, channelId: string) => Promise<{ repositoryName: string; slackChannelName: string; aiModel: string | null; isActive: boolean }[]>
): Promise<{ response_type: "ephemeral"; text?: string; blocks?: any[] }> {
  const command = (payload.command || "").toLowerCase().replace(/^\/+/, "");
  const text = (payload.text || "").trim().toLowerCase();

  if (command === "pushlog" && (text === "help" || text === "")) {
    return {
      response_type: "ephemeral",
      text: "PushLog commands",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: "🌳 *PushLog* - GitHub → Slack with AI summaries\nUse these commands in any connected channel:" } },
        { type: "section", text: { type: "mrkdwn", text: "• `/pushlog` or `/pushlog help` - show this help" } },
        { type: "section", text: { type: "mrkdwn", text: "• `/pushlog status` - show integrations in this channel" } },
        { type: "section", text: { type: "mrkdwn", text: "• `/pushlog model` - show AI model for this channel" } },
        { type: "context", elements: [{ type: "mrkdwn", text: "Manage integrations and models at <https://pushlog.ai|pushlog.ai>" }] },
      ],
    };
  }

  const integrations = await getIntegrationsForChannel(payload.team_id, payload.channel_id);

  if (command === "pushlog" && text === "status") {
    if (integrations.length === 0) {
      return {
        response_type: "ephemeral",
        text: "No PushLog integrations in this channel. Connect a repo at https://pushlog.ai",
      };
    }
    const lines = integrations.map(
      (i) => `• *${i.repositoryName}* → #${i.slackChannelName} — ${i.isActive ? "✅ Active" : "⏸ Paused"} — AI: ${modelLabel(i.aiModel)}`
    );
    return {
      response_type: "ephemeral",
      text: "PushLog integrations in this channel",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: "📡 *Integrations in #" + payload.channel_name + "*" } },
        { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
        { type: "context", elements: [{ type: "mrkdwn", text: "Change settings at <https://pushlog.ai/integrations|pushlog.ai/integrations>" }] },
      ],
    };
  }

  if (command === "pushlog" && text === "model") {
    if (integrations.length === 0) {
      return {
        response_type: "ephemeral",
        text: "No PushLog integration in this channel. Connect a repo at https://pushlog.ai",
      };
    }
    const lines = integrations.map((i) => `• *${i.repositoryName}* — AI model: ${modelLabel(i.aiModel)}`);
    return {
      response_type: "ephemeral",
      text: "AI model for this channel",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: "🤖 *AI model for #" + payload.channel_name + "*" } },
        { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
        { type: "context", elements: [{ type: "mrkdwn", text: "Change model at <https://pushlog.ai/models|pushlog.ai/models> or in Integration Settings" }] },
      ],
    };
  }

  if (command === "pushlog") {
    return {
      response_type: "ephemeral",
      text: "Unknown subcommand. Use `/pushlog help` for commands.",
    };
  }

  return {
    response_type: "ephemeral",
    text: "Use `/pushlog help` for PushLog commands.",
  };
}
