/**
 * GitHub webhook handling: parse event, resolve repo/integration, build push data,
 * AI summary, Slack notification, risk scoring, and persist.
 * Refactored from a single 300-line handler into phased helpers.
 */

import type { Request, Response } from "express";
import { storage } from "./storage";
import { databaseStorage } from "./database";
import { getCommit } from "./github";
import { decrypt } from "./encryption";
import { generateCodeSummary, generateSlackMessage } from "./ai";
import { sendPushNotification, sendSlackMessage } from "./slack";
import broadcastNotification from "./helper/broadcastNotification";
import { scorePush } from "./riskEngine";
import { ingestPushEvent } from "./streamingStats";
import { ingestIncidentEvent } from "./incidentEngine";
import { fetchOpenRouterGenerationUsage } from "./ai";

const OPENROUTER_FREE_MODEL_OVER_BUDGET = "arcee-ai/trinity-large-preview:free";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws if ID looks like old integer (from pre-UUID migration). Gives a clear error. */
function assertUuid(id: unknown, label: string): void {
  const s = String(id ?? "");
  if (s && !UUID_REGEX.test(s) && /^\d+$/.test(s)) {
    throw new Error(
      `Invalid ${label}=${s} (looks like old integer ID). ` +
        "Ensure the UUID migration has been run on this database: psql $DATABASE_URL -f migrations/migrate-integer-to-uuid.sql"
    );
  }
}

function looksLikeOpenRouterKey(s: string | null | undefined): boolean {
  return !!s?.trim().startsWith("sk-or-");
}

export function scheduleDelayedCostUpdate(opts: {
  generationId: string;
  apiKey: string;
  pushEventId: string;
  userId: string;
  delayMs?: number;
  retries?: number;
}) {
  const { generationId, apiKey, pushEventId, userId, delayMs = 15_000, retries = 2 } = opts;
  let attempt = 0;
  const tryUpdate = () => {
    attempt++;
    setTimeout(async () => {
      try {
        const genUsage = await fetchOpenRouterGenerationUsage(generationId, apiKey);
        if (genUsage && genUsage.costCents > 0) {
          await databaseStorage.updateAiUsage(pushEventId, userId, {
            cost: genUsage.costCents,
            ...(genUsage.tokensUsed > 0 ? { tokensUsed: genUsage.tokensUsed } : {}),
          } as any);
          console.log(`💰 Delayed cost update succeeded (attempt ${attempt}): push=${pushEventId}, cost=$${(genUsage.costCents / 10000).toFixed(4)}, tokens=${genUsage.tokensUsed}`);
        } else if (attempt < retries) {
          console.log(`💰 Delayed cost update: still $0 on attempt ${attempt}/${retries}, retrying...`);
          setTimeout(tryUpdate, 0);
        } else {
          console.log(`💰 Delayed cost update: cost still $0 after ${attempt} attempts for push=${pushEventId}.`);
        }
      } catch (err) {
        console.warn(`💰 Delayed cost update error (attempt ${attempt}):`, err instanceof Error ? err.message : err);
        if (attempt < retries) setTimeout(tryUpdate, 0);
      }
    }, attempt === 1 ? delayMs : delayMs * 2);
  };
  tryUpdate();
}

// --- Phase 1: Parse event (push vs PR) ---
export function parseWebhookPayload(req: Request, res: Response): { eventType: string; branch: string; commit: any; repository: any } | null {
  const eventType = req.headers["x-github-event"];
  const repoName = req.body?.repository?.full_name || req.body?.repository?.name || "unknown";
  console.log(`📥 [Webhook] Received ${eventType} for ${repoName}`);

  let branch: string, commit: any, repository: any;
  if (eventType === "pull_request") {
    const { pull_request, action } = req.body;
    if (!pull_request) {
      res.status(200).json({ message: "Not a pull request event, skipping" });
      return null;
    }
    if (action !== "closed" || !pull_request.merged) {
      res.status(200).json({ message: "Pull request not merged, skipping" });
      return null;
    }
    branch = pull_request.base.ref;
    commit = { id: pull_request.merge_commit_sha, message: pull_request.title, author: { name: pull_request.user.login }, timestamp: pull_request.merged_at, additions: pull_request.additions || 0, deletions: pull_request.deletions || 0 };
    repository = req.body.repository;
  } else if (eventType === "push") {
    const { ref, commits, repository: repo } = req.body;
    if (!ref || !commits?.length) {
      res.status(200).json({ message: "No commits to process" });
      return null;
    }
    branch = ref.replace("refs/heads/", "");
    commit = commits[0];
    repository = repo;
  } else {
    res.status(200).json({ message: `Unsupported event type: ${eventType}` });
    return null;
  }
  if (!repository) {
    res.status(200).json({ message: "No repository information found" });
    return null;
  }
  return { eventType, branch, commit, repository };
}

// --- Phase 2: Resolve repo and integration ---
export async function resolveRepoAndIntegration(
  repository: any,
  res: Response
): Promise<{ storedRepo: any; integration: any } | null> {
  const storedRepo = await storage.getRepositoryByGithubId(repository.id.toString());
  if (!storedRepo || !storedRepo.isActive) {
    console.log(`⚠️ [Webhook] Repository ${repository.full_name} (GitHub id ${repository.id}) not in DB or not active.`);
    res.status(200).json({ message: "Repository not active" });
    return null;
  }
  const integration = await storage.getIntegrationByRepositoryId(storedRepo.id);
  if (!integration || !integration.isActive) {
    console.log(`⚠️ [Webhook] No active integration for ${repository.full_name}.`);
    res.status(200).json({ message: "Integration not active" });
    return null;
  }
  // Catch old integer IDs from pre-UUID migration (fixes "invalid input syntax for type uuid" errors)
  assertUuid(storedRepo.id, "repository.id");
  assertUuid(integration.id, "integration.id");
  assertUuid(integration.userId, "integration.userId");
  if (integration.slackWorkspaceId) {
    assertUuid(integration.slackWorkspaceId, "integration.slackWorkspaceId");
  }
  return { storedRepo, integration };
}

// --- Phase 3: Build pushData (and optionally fetch additions/deletions from GitHub API) ---
export async function buildPushData(
  eventType: string,
  branch: string,
  repository: any,
  commit: any,
  integration: any
): Promise<{ pushData: any; authorName: string }> {
  const authorName = commit?.author?.name || commit?.author?.username || "Unknown";
  const filesFromCommit = [...(commit?.added || []), ...(commit?.modified || []), ...(commit?.removed || [])];
  let additions = commit?.additions ?? 0;
  let deletions = commit?.deletions ?? 0;

  if (eventType === "push" && additions === 0 && deletions === 0) {
    const repoName = repository.full_name || repository.name || "unknown";
    const commitSha = commit?.id || commit?.sha;
    if (repoName && commitSha && repoName.includes("/")) {
      const [owner, repo] = repoName.split("/");
      let token: string | null = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || null;
      if (!token?.trim()) {
        const user = await databaseStorage.getUserById(integration.userId);
        const raw = (user as any)?.githubToken;
        token = raw && typeof raw === "string" ? raw : null;
      }
      const stats = await getCommit(owner, repo, commitSha, token);
      if (stats) {
        additions = stats.additions;
        deletions = stats.deletions;
      }
    }
  }

  const pushData = {
    repositoryName: repository.full_name || repository.name || "unknown",
    branch,
    commitMessage: commit?.message?.trim() || "(no message)",
    filesChanged: filesFromCommit.length ? filesFromCommit : ["(no file list)"],
    additions,
    deletions,
    commitSha: commit?.id || commit?.sha || "unknown",
  };
  return { pushData, authorName };
}

// --- Phase 4: Get Slack workspace token ---
export async function getSlackWorkspaceToken(integration: any, res: Response): Promise<string | null> {
  let workspaceToken: string | null = null;
  if (integration.slackWorkspaceId) {
    const workspace = await databaseStorage.getSlackWorkspace(integration.slackWorkspaceId);
    workspaceToken = workspace?.accessToken ?? null;
  }
  if (!workspaceToken) {
    console.error(`⚠️ [Webhook] No Slack workspace token for integration ${integration.id}.`);
    res.status(200).json({ message: "Slack workspace not configured" });
    return null;
  }
  return workspaceToken;
}

// --- Phase 5: AI config + budget check ---
export async function getAiConfigAndBudget(integration: any): Promise<{
  effectiveAiModel: string;
  useOpenRouter: boolean;
  openRouterKeyRaw: string | null;
  overBudgetSkipAi: boolean;
  maxTokens: number;
}> {
  const integrationAiModel = (integration as any).aiModel ?? (integration as any).ai_model;
  const aiModelStr = (typeof integrationAiModel === "string" && integrationAiModel.trim()) ? integrationAiModel.trim() : "gpt-4o";
  const maxTokens = integration.maxTokens || 350;
  let openRouterKeyRaw = (integration as any).openRouterApiKey ? decrypt((integration as any).openRouterApiKey) : null;
  if (!looksLikeOpenRouterKey(openRouterKeyRaw)) openRouterKeyRaw = null;
  if (!openRouterKeyRaw?.trim()) {
    const userForKey = await databaseStorage.getUserById(integration.userId);
    if ((userForKey as any)?.openRouterApiKey) openRouterKeyRaw = decrypt((userForKey as any).openRouterApiKey);
  }
  if (!looksLikeOpenRouterKey(openRouterKeyRaw)) openRouterKeyRaw = null;
  const useOpenRouter = !!openRouterKeyRaw?.trim();
  let effectiveAiModel = useOpenRouter ? aiModelStr.trim() : aiModelStr.toLowerCase();

  let overBudgetSkipAi = false;
  try {
    const userForBudget = await databaseStorage.getUserById(integration.userId);
    const monthlyBudget = (userForBudget as any)?.monthlyBudget;
    if (monthlyBudget != null && monthlyBudget > 0) {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const monthlySpend = await databaseStorage.getMonthlyAiSpend(integration.userId, monthStart);
      if (monthlySpend >= monthlyBudget) {
        const overBudgetBehavior = (userForBudget as any)?.overBudgetBehavior === "skip_ai" ? "skip_ai" : "free_model";
        const urgentMetadata = JSON.stringify({ monthlySpend, monthlyBudget, urgent: true });
        const useFreeModel = useOpenRouter && overBudgetBehavior === "free_model";
        const budgetNotif = await storage.createNotification({
          userId: integration.userId,
          type: "budget_alert",
          title: "Monthly budget exceeded",
          message: useFreeModel
            ? `Your AI budget is reached. Summaries are now using the free model until you raise your budget or next month. Spend: $${(monthlySpend / 10000).toFixed(4)} / $${(monthlyBudget / 10000).toFixed(2)}.`
            : `Your AI spend ($${(monthlySpend / 10000).toFixed(4)}) exceeded your budget of $${(monthlyBudget / 10000).toFixed(2)}. ${useOpenRouter ? "AI summaries are paused until you raise your budget or next month (change this in Models → When over budget)." : "Reset your budget on the Models page to get AI summaries again."}`,
          metadata: urgentMetadata,
        });
        broadcastNotification(integration.userId, { id: budgetNotif.id, type: "budget_alert", title: budgetNotif.title, message: budgetNotif.message, metadata: budgetNotif.metadata, createdAt: budgetNotif.createdAt, isRead: false });
        if (useOpenRouter) {
          if (overBudgetBehavior === "skip_ai") {
            overBudgetSkipAi = true;
            console.log(`📊 [Webhook] User over budget; skipping AI (user preference: skip_ai).`);
          } else {
            effectiveAiModel = OPENROUTER_FREE_MODEL_OVER_BUDGET;
            console.log(`📊 [Webhook] User over budget; using free model ${effectiveAiModel} for this push.`);
          }
        } else {
          overBudgetSkipAi = true;
        }
      }
    }
  } catch (budgetErr) {
    console.warn("Budget pre-check error:", budgetErr);
  }
  return { effectiveAiModel, useOpenRouter, openRouterKeyRaw, overBudgetSkipAi, maxTokens };
}

// --- Phase 6: Run AI summary (optional) ---
export async function runAiSummary(
  pushData: any,
  integration: any,
  repoDisplayName: string,
  opts: { effectiveAiModel: string; useOpenRouter: boolean; openRouterKeyRaw: string | null; overBudgetSkipAi: boolean; maxTokens: number }
): Promise<{ summary: any; aiGenerated: boolean; aiSummary: string | null; aiImpact: string | null; aiCategory: string | null; aiDetails: string | null }> {
  let summary: Awaited<ReturnType<typeof generateCodeSummary>> | null = null;
  if (!opts.overBudgetSkipAi) {
    try {
      summary = await generateCodeSummary(
        pushData,
        opts.effectiveAiModel,
        opts.maxTokens,
        opts.useOpenRouter && opts.openRouterKeyRaw
          ? { openRouterApiKey: opts.openRouterKeyRaw.trim(), notificationContext: { userId: integration.userId, repositoryName: repoDisplayName, integrationId: integration.id, slackChannelName: integration.slackChannelName } }
          : undefined
      );
    } catch (aiErr: any) {
      console.warn("⚠️ [Webhook] AI summary failed, sending plain push notification:", aiErr);
    }
  }
  const hasValidContent = !!(summary?.summary?.summary?.trim() && summary?.summary?.impact && summary?.summary?.category);
  const aiGenerated = !!summary && !summary.isFallback && hasValidContent;
  return {
    summary,
    aiGenerated,
    aiSummary: aiGenerated ? (summary!.summary!.summary ?? null) : null,
    aiImpact: aiGenerated ? (summary!.summary!.impact ?? null) : null,
    aiCategory: aiGenerated ? (summary!.summary!.category ?? null) : null,
    aiDetails: aiGenerated ? (summary!.summary!.details ?? null) : null,
  };
}

// --- Phase 7: Send Slack message ---
export async function sendSlackForPush(
  workspaceToken: string,
  integration: any,
  pushData: any,
  authorName: string,
  aiResult: { aiGenerated: boolean; aiSummary: string | null; aiImpact: string | null; aiCategory: string | null; aiDetails: string | null },
  res: Response
): Promise<boolean> {
  try {
    if (aiResult.aiGenerated && aiResult.aiSummary) {
      const slackMessage = await generateSlackMessage(pushData, {
        summary: aiResult.aiSummary,
        impact: aiResult.aiImpact as "low" | "medium" | "high",
        category: aiResult.aiCategory!,
        details: aiResult.aiDetails!,
      });
      await sendSlackMessage(workspaceToken, {
        channel: integration.slackChannelId,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: slackMessage } }],
        text: slackMessage,
        unfurl_links: false,
      });
      console.log(`✅ [Webhook] AI Slack message sent to #${integration.slackChannelName}`);
    } else {
      await sendPushNotification(workspaceToken, integration.slackChannelId, pushData.repositoryName, pushData.commitMessage, authorName, pushData.branch, pushData.commitSha, Boolean(integration.includeCommitSummaries));
      console.log(`✅ [Webhook] Push notification sent to #${integration.slackChannelName}`);
    }
    return true;
  } catch (slackErr) {
    console.error("❌ [Webhook] Failed to send Slack message:", slackErr);
    res.status(500).json({ error: "Webhook processed but Slack delivery failed" });
    return false;
  }
}

// --- Phase 8: Persist push event, AI usage, notifications ---
export async function persistPushAndNotifications(
  storedRepo: any,
  integration: any,
  pushData: any,
  authorName: string,
  commit: any,
  aiResult: { summary: any; aiGenerated: boolean; aiSummary: string | null; aiImpact: string | null; aiCategory: string | null; aiDetails: string | null; effectiveAiModel: string; useOpenRouter: boolean; openRouterKeyRaw: string | null }
): Promise<void> {
  const pushedAt = commit?.timestamp ? new Date(commit.timestamp) : new Date();
  const riskResult = await scorePush({
    commitMessage: pushData.commitMessage,
    filesChanged: pushData.filesChanged,
    additions: pushData.additions ?? 0,
    deletions: pushData.deletions ?? 0,
  });
  if (riskResult.impact_score > 0 || riskResult.risk_flags.length > 0) {
    console.log(`📊 [Webhook] Risk engine: impact=${riskResult.impact_score} flags=${riskResult.risk_flags.join(",")}`);
  }
  const pushEvent = await storage.createPushEvent({
    repositoryId: storedRepo.id,
    integrationId: integration.id,
    commitSha: pushData.commitSha,
    commitMessage: pushData.commitMessage,
    author: authorName,
    branch: pushData.branch,
    pushedAt,
    notificationSent: true,
    additions: pushData.additions,
    deletions: pushData.deletions,
    aiSummary: aiResult.aiSummary ?? null,
    aiImpact: aiResult.aiImpact ?? null,
    aiCategory: aiResult.aiCategory ?? null,
    aiDetails: aiResult.aiDetails ?? null,
    aiGenerated: !!aiResult.aiGenerated,
    impactScore: riskResult.impact_score,
    riskFlags: riskResult.risk_flags,
    riskMetadata: {
      change_type_tags: riskResult.change_type_tags,
      hotspot_files: riskResult.hotspot_files,
      explanations: riskResult.explanations,
    },
  });

  // Fire-and-forget: update streaming stats (no-op if STATS_ENGINE_URL unset)
  ingestPushEvent({
    user_id: integration.userId,
    repository_id: storedRepo.id,
    impact_score: riskResult.impact_score ?? 0,
    timestamp: pushEvent.pushedAt instanceof Date ? pushEvent.pushedAt.toISOString() : String(pushEvent.pushedAt),
  });

  // Feed push as deploy event into incident-engine for all integrations (incident alerts when engine triggers)
  const pushedAtStr = pushEvent.pushedAt instanceof Date ? pushEvent.pushedAt.toISOString() : String(pushEvent.pushedAt);
  const files = pushData.filesChanged ?? [];
  const stacktrace = (files.length ? files.filter((f: string) => f !== "(no file list)") : [])
    .slice(0, 10)
    .map((f: string) => ({ file: f, function: "changed" }));
  if (stacktrace.length === 0) stacktrace.push({ file: pushData.repositoryName, function: "deploy" });
  const severity = (riskResult.impact_score ?? 0) >= 60 ? "critical" : (riskResult.impact_score ?? 0) >= 30 ? "error" : "warning";
  try {
    ingestIncidentEvent({
      source: "pushlog",
      service: pushData.repositoryName,
      environment: pushData.branch,
      timestamp: pushedAtStr,
      severity,
      exception_type: "GitPush",
      message: pushData.commitMessage,
      stacktrace,
      links: { pushlog_user_id: integration.userId },
      change_window: {
        deploy_time: pushedAtStr,
        commits: [{ id: pushData.commitSha, timestamp: commit?.timestamp, files: files }],
      },
    });
  } catch (e) {
    console.warn("⚠️ [Webhook] Failed to ingest push into incident-engine (non-fatal):", e instanceof Error ? e.message : e);
  }

  if (aiResult.aiGenerated && aiResult.summary && ((aiResult.summary.tokensUsed > 0) || ((aiResult.summary.cost ?? 0) > 0))) {
    await databaseStorage.createAiUsage({
      userId: integration.userId,
      integrationId: integration.id,
      pushEventId: pushEvent.id,
      model: aiResult.summary.actualModel || aiResult.effectiveAiModel,
      tokensUsed: aiResult.summary.tokensUsed,
      cost: aiResult.summary.cost ?? 0,
      openrouterGenerationId: aiResult.summary.openrouterGenerationId ?? null,
    });
    if ((aiResult.summary.cost ?? 0) === 0 && aiResult.summary.openrouterGenerationId && aiResult.useOpenRouter && aiResult.openRouterKeyRaw) {
      scheduleDelayedCostUpdate({
        generationId: aiResult.summary.openrouterGenerationId,
        apiKey: aiResult.openRouterKeyRaw.trim(),
        pushEventId: pushEvent.id,
        userId: integration.userId,
      });
    }
  }
  const repoDisplayName = storedRepo.name || pushData.repositoryName.split("/").pop() || pushData.repositoryName;
  const sharedMetadata: Record<string, unknown> = {
    pushEventId: pushEvent.id,
    repositoryId: storedRepo.id,
    repositoryName: pushData.repositoryName,
    repositoryFullName: pushData.repositoryName,
    branch: pushData.branch,
    commitSha: pushData.commitSha,
    commitMessage: pushData.commitMessage,
    author: authorName,
    aiGenerated: !!aiResult.aiGenerated,
    slackChannelName: integration.slackChannelName,
    integrationId: integration.id,
    pushedAt: pushEvent.pushedAt instanceof Date ? pushEvent.pushedAt.toISOString() : pushEvent.pushedAt,
    additions: pushData.additions ?? 0,
    deletions: pushData.deletions ?? 0,
    filesChanged: pushData.filesChanged?.length ?? 0,
    aiModel: aiResult.effectiveAiModel ?? null,
    aiSummary: aiResult.aiSummary ?? null,
    aiImpact: aiResult.aiImpact ?? null,
    aiCategory: aiResult.aiCategory ?? null,
  };
  try {
    const pushNotif = await storage.createNotification({
      userId: integration.userId,
      type: "push_event",
      title: "New Push Event",
      message: `New push to ${repoDisplayName} by ${authorName}`,
      metadata: JSON.stringify(sharedMetadata),
    });
    broadcastNotification(integration.userId, { id: pushNotif.id, type: "push_event", title: pushNotif.title, message: pushNotif.message, metadata: pushNotif.metadata, createdAt: pushNotif.createdAt, isRead: false });
    const slackNotif = await storage.createNotification({
      userId: integration.userId,
      type: "slack_message_sent",
      title: "Slack Message Sent",
      message: aiResult.aiGenerated ? `AI summary sent to #${integration.slackChannelName} for ${repoDisplayName}` : `Push notification sent to #${integration.slackChannelName} for ${repoDisplayName}`,
      metadata: JSON.stringify(sharedMetadata),
    });
    broadcastNotification(integration.userId, { id: slackNotif.id, type: "slack_message_sent", title: slackNotif.title, message: slackNotif.message, metadata: slackNotif.metadata, createdAt: slackNotif.createdAt, isRead: false });
  } catch (notifErr) {
    console.warn("⚠️ [Webhook] Failed to create notifications (non-fatal):", notifErr);
  }
}

// --- Main handler: orchestrate phases ---
export async function handleGitHubWebhook(req: Request, res: Response): Promise<void> {
  try {
    const parsed = parseWebhookPayload(req, res);
    if (!parsed) return;
    const { eventType, branch, commit, repository } = parsed;

    const resolved = await resolveRepoAndIntegration(repository, res);
    if (!resolved) return;
    const { storedRepo, integration } = resolved;

    const { pushData, authorName } = await buildPushData(eventType, branch, repository, commit, integration);

    const workspaceToken = await getSlackWorkspaceToken(integration, res);
    if (!workspaceToken) return;

    console.log(`📤 [Webhook] Processing push: ${repository.full_name} @ ${branch} → Slack #${integration.slackChannelName}`);

    const aiConfig = await getAiConfigAndBudget(integration);
    const repoDisplayName = storedRepo?.name || pushData.repositoryName.split("/").pop() || pushData.repositoryName;
    const aiResult = await runAiSummary(pushData, integration, repoDisplayName, aiConfig);

    const slackSent = await sendSlackForPush(workspaceToken, integration, pushData, authorName, aiResult, res);
    if (!slackSent) return;

    try {
      await persistPushAndNotifications(storedRepo, integration, pushData, authorName, commit, {
        ...aiResult,
        effectiveAiModel: aiConfig.effectiveAiModel,
        useOpenRouter: aiConfig.useOpenRouter,
        openRouterKeyRaw: aiConfig.openRouterKeyRaw,
      });
    } catch (recordErr) {
      console.warn("⚠️ [Webhook] Failed to record push event/usage (non-fatal):", recordErr);
    }

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
