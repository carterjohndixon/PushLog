import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateTokenCost } from './stripe';
import broadcastNotification from './helper/broadcastNotification';
import { storage } from './storage';

const __filenameAi = fileURLToPath(import.meta.url);
const __dirnameAi = path.dirname(__filenameAi);
const rootAi = path.join(__dirnameAi, '..');
const appEnvAi = process.env.APP_ENV || process.env.NODE_ENV || '';
if (appEnvAi === 'production' || appEnvAi === 'staging') {
  dotenv.config({ path: path.join(rootAi, `.env.${appEnvAi}`), override: true });
} else {
  dotenv.config({ path: path.join(rootAi, '.env') });
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface PushEventData {
  repositoryName: string;
  branch: string;
  commitMessage: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
  commitSha: string;
}

export interface CodeSummary {
  summary: string;
  impact: 'low' | 'medium' | 'high';
  category: string;
  details: string;
}

export interface AiUsageResult {
  summary: CodeSummary;
  tokensUsed: number;
  cost: number; // in units of $0.0001 (ten-thousandths of a dollar)
  actualModel?: string; // The actual model used by OpenAI
  /** OpenRouter generation id (gen-xxx) when using OpenRouter; use for GET /api/v1/generation?id=... */
  openrouterGenerationId?: string | null;
  /** True when the API failed and we returned a generic fallback (do not treat as real AI summary). */
  isFallback?: boolean;
  /** When set, the failure was an OpenRouter error (rate limit, data policy, etc.) so the caller can notify the user. */
  openRouterError?: string;
}

export interface GenerateCodeSummaryOptions {
  /** When set, use OpenRouter with this API key and treat model as OpenRouter model id (e.g. openai/gpt-4o). No PushLog credit deduction. */
  openRouterApiKey?: string;
  /** When set, use user's OpenAI API key (user pays OpenAI). No PushLog credit deduction. */
  openaiApiKey?: string;
  /** When set, OpenRouter errors will create an in-app notification for this user and broadcast it. */
  notificationContext?: {
    userId: string;
    repositoryName: string;
    integrationId: string;
    slackChannelName: string;
  };
}

/** OpenRouter generation API response: may be { data: generation } or the generation object at top level. */
type OpenRouterGenerationResponse = {
  data?: {
    usage?: number;
    total_cost?: number;
    tokens_prompt?: number;
    tokens_completion?: number;
  };
  usage?: number;
  total_cost?: number;
  tokens_prompt?: number;
  tokens_completion?: number;
};

const OPENROUTER_GENERATION_ID_HEADER = 'x-openrouter-generation-id';

/** OpenRouter gen-xxx id pattern; used to find generation id in response body when header is missing. */
const GEN_ID_REGEX = /^gen-[a-zA-Z0-9_-]+$/;

/** Recursively find first string value that looks like an OpenRouter generation id (gen-xxx). Max depth 4. */
function findGenIdInObject(obj: unknown, depth = 0): string | null {
  if (depth > 4 || obj === null || obj === undefined) return null;
  if (typeof obj === 'string' && GEN_ID_REGEX.test(obj.trim())) return obj.trim();
  if (typeof obj === 'object' && obj !== null) {
    for (const v of Object.values(obj)) {
      const found = findGenIdInObject(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Fetch usage/cost for an OpenRouter generation by ID. OpenRouter expects gen-xxx; chatcmpl-xxx (completion.id) often returns 404. */
export async function fetchOpenRouterGenerationUsage(
  generationId: string,
  apiKey: string
): Promise<{ tokensUsed: number; costCents: number } | null> {
  const idPrefix = generationId.startsWith('gen-') ? 'gen-xxx' : generationId.startsWith('chatcmpl-') ? 'chatcmpl-xxx' : 'other';
  console.log(`📊 OpenRouter generation lookup: id type=${idPrefix}, id=${generationId.slice(0, 32)}...`);
  try {
    const url = new URL('https://openrouter.ai/api/v1/generation');
    url.searchParams.set('id', generationId);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`📊 OpenRouter generation lookup failed: ${res.status} ${res.statusText} for id=${generationId.slice(0, 24)}...`, body.slice(0, 200));
      return null;
    }
    const json = (await res.json()) as OpenRouterGenerationResponse;
    // API can return { data: { ... } } or the generation object at top level (e.g. from activity)
    const data = json?.data ?? (json as Record<string, unknown>);
    if (!data || typeof data !== 'object') {
      console.warn('📊 OpenRouter generation lookup: response had no data object');
      return null;
    }
    const raw = data as Record<string, unknown>;
    // Prefer total_cost (the final billed amount) over usage
    const costUsd = (raw.total_cost ?? raw.usage) as number | undefined;
    // Store in units of $0.0001 (ten-thousandths of a dollar) for sub-cent precision
    const costCents = typeof costUsd === 'number' && costUsd > 0 ? Math.round(costUsd * 10000) : 0;
    const tokensPrompt = (raw.tokens_prompt as number | undefined) ?? 0;
    const tokensCompletion = (raw.tokens_completion as number | undefined) ?? 0;
    const tokensUsed =
      (typeof tokensPrompt === 'number' ? tokensPrompt : 0) +
      (typeof tokensCompletion === 'number' ? tokensCompletion : 0) || 0;
    console.log(`📊 OpenRouter generation lookup OK: tokens=${tokensUsed}, costCents=${costCents}`);
    return { tokensUsed, costCents };
  } catch (e) {
    console.warn('📊 OpenRouter generation lookup error:', e);
    return null;
  }
}

export async function generateCodeSummary(
  pushData: PushEventData, 
  model: string = 'gpt-5.2', // PushLog: gpt-5.2, gpt-4o, etc. OpenRouter: e.g. openai/gpt-4o, anthropic/claude-3.5-sonnet
  maxTokens: number = 1000,
  options?: GenerateCodeSummaryOptions
): Promise<AiUsageResult> {
  const useOpenRouter = !!options?.openRouterApiKey?.trim();
  const useUserOpenAi = !!options?.openaiApiKey?.trim();
  // Reasoning models (e.g. Kimi K2.5) output reasoning then content; need enough tokens so JSON isn't cut off
  const effectiveMaxTokens = useOpenRouter ? Math.max(maxTokens, 1400) : maxTokens;
  const client = useOpenRouter
    ? new OpenAI({
        apiKey: options!.openRouterApiKey!.trim(),
        baseURL: 'https://openrouter.ai/api/v1',
      })
    : useUserOpenAi
      ? new OpenAI({ apiKey: options!.openaiApiKey!.trim() })
      : openai;

  // For PushLog-only: migrate invalid models to gpt-5.2
  if (!useOpenRouter) {
    const validModels = ['gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.3-codex-spark', 'gpt-5.2', 'gpt-5.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-turbo-preview', 'gpt-4-0125-preview', 'gpt-4-1106-preview', 'gpt-4', 'gpt-4-0613', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0125', 'gpt-3.5-turbo-1106', 'gpt-3.5-turbo-16k'];
    if (!validModels.includes(model)) {
      console.warn(`⚠️ Invalid or deprecated model "${model}" detected. Migrating to gpt-5.2.`);
      model = 'gpt-5.2';
    }
  }

  try {
    const prompt = `
You are a world-class code review assistant tasked with analyzing a git push and providing a concise, helpful summary of the highest level of detail possible. Analyze this git push and provide a concise, helpful summary.

Repository: ${pushData.repositoryName}
Branch: ${pushData.branch}
Commit Message: ${pushData.commitMessage}
Files Changed: ${pushData.filesChanged.join(', ')}
Changes: +${pushData.additions} -${pushData.deletions} lines

Please provide a summary in this JSON format:
{
  "summary": "Brief 1-2 sentence summary of what changed",
  "impact": "low|medium|high - based on the scope and nature of changes",
  "category": "feature|bugfix|refactor|docs|test|security|other",
  "details": "More detailed explanation of the changes and their purpose"
}

Focus on:
- What functionality was added/modified/fixed
- The business impact or user benefit
- Any important technical details
- Keep it concise but informative

Respond with only valid JSON:
`;

    console.log(`🔍 ${useOpenRouter ? 'OpenRouter' : useUserOpenAi ? 'OpenAI (user key)' : 'OpenAI (PushLog)'} API Request - Model: ${model}, Max Tokens: ${effectiveMaxTokens}`);
    const requestParams: any = {
      model: model,
      messages: [
        {
          role: "system",
          content: "You are a helpful code review assistant that provides clear, concise summaries of code changes. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: effectiveMaxTokens,
      temperature: 0.3, // All supported models support temperature
    };

    let completion: OpenAI.Chat.Completions.ChatCompletion | undefined;
    let openRouterGenerationId: string | null = null;

    if (useOpenRouter && options?.openRouterApiKey) {
      // Use fetch so we can read x-openrouter-generation-id header (needed for cost lookup)
      const openRouterMaxRetries = 2; // 503/429: retry up to 2 times (3 attempts total)
      const retryDelaysMs = [2000, 4000]; // backoff: 2s, then 4s
      let lastRes: Response | null = null;
      let lastErrBody = '';
      let completionJson: unknown = null;
      try {
        for (let attempt = 0; attempt <= openRouterMaxRetries; attempt++) {
          if (attempt > 0) {
            const delay = retryDelaysMs[attempt - 1] ?? 4000;
            console.log(`🔄 OpenRouter retry ${attempt}/${openRouterMaxRetries} in ${delay}ms (503/429 server at capacity or rate limit)`);
            await new Promise((r) => setTimeout(r, delay));
          }
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${options.openRouterApiKey.trim()}`,
            },
            body: JSON.stringify(requestParams),
          });
          lastRes = res;
          openRouterGenerationId = res.headers.get(OPENROUTER_GENERATION_ID_HEADER)?.trim() || null;
          if (!openRouterGenerationId && typeof res.headers.get === 'function') {
            const tryHeader = (name: string) => res.headers.get(name)?.trim() || null;
            openRouterGenerationId = tryHeader('x-openrouter-generation-id')
              || tryHeader('X-OpenRouter-Generation-Id')
              || tryHeader('openrouter-generation-id');
          }
          if (!openRouterGenerationId && res.ok) {
            const headerNames = typeof res.headers.entries === 'function'
              ? Array.from(res.headers.entries()).map(([k]) => k)
              : [];
            console.warn('📊 OpenRouter: no generation id in response header (CDN may strip it). Headers:', headerNames.join(', ') || '(none)');
          } else if (openRouterGenerationId && res.ok) {
            console.log('📊 OpenRouter: generation id from header:', openRouterGenerationId.slice(0, 28) + '...');
          }
          if (!res.ok) {
            lastErrBody = await res.text();
            const retryable = (res.status === 503 || res.status === 429) && attempt < openRouterMaxRetries;
            if (retryable) {
              console.warn(`⚠️ OpenRouter ${res.status} (attempt ${attempt + 1}/${openRouterMaxRetries + 1}), will retry:`, lastErrBody.slice(0, 150));
              continue;
            }
            console.error('❌ OpenRouter API Error:', res.status, res.statusText, lastErrBody.slice(0, 300));
            if (res.status === 404 && /data policy|Free model publication|privacy/i.test(lastErrBody)) {
              throw new Error(
                'OpenRouter rejected the request: your account\'s data policy does not allow this model (e.g. free models). ' +
                'Configure it at https://openrouter.ai/settings/privacy and enable "Free model publication" or the option that matches your model.'
              );
            }
            if (res.status === 429) {
              throw new Error(
                'OpenRouter rate limit: this model is temporarily rate-limited. Retry in a few minutes, or add your own provider key at https://openrouter.ai/settings/integrations to use your own rate limits.'
              );
            }
            if (res.status === 503) {
              throw new Error(
                'OpenRouter provider at capacity (503). The AI provider was temporarily overloaded. Your push was still sent to Slack; try again in a moment.'
              );
            }
            throw new Error(`OpenRouter ${res.status}: ${lastErrBody.slice(0, 200)}`);
          }
          const bodyText = await res.text();
          try {
            completionJson = bodyText ? JSON.parse(bodyText) : null;
          } catch (parseErr: any) {
            const retryable = attempt < openRouterMaxRetries;
            if (retryable) {
              console.warn(`⚠️ OpenRouter response invalid/truncated JSON (attempt ${attempt + 1}), will retry:`, parseErr?.message ?? parseErr);
              continue;
            }
            throw new Error(`OpenRouter returned invalid or empty response: ${parseErr?.message ?? 'Unexpected end of JSON input'}`);
          }
          if (!completionJson || typeof completionJson !== 'object') {
            const retryable = attempt < openRouterMaxRetries;
            if (retryable) {
              console.warn(`⚠️ OpenRouter response empty (attempt ${attempt + 1}), will retry`);
              continue;
            }
            throw new Error('OpenRouter returned empty response');
          }
          completion = completionJson as OpenAI.Chat.Completions.ChatCompletion;
          break;
        }
        if (!lastRes?.ok) {
          console.error('❌ OpenRouter failed after retries:', lastRes?.status, lastErrBody.slice(0, 200));
          throw new Error(`OpenRouter ${lastRes?.status ?? 'error'}: ${lastErrBody.slice(0, 200)}`);
        }
        // OpenRouter may return generation id only in body when header is missing (header is often stripped by CDN e.g. Cloudflare)
        if (!openRouterGenerationId && completionJson) {
          const fromBody = findGenIdInObject(completionJson);
          if (fromBody) {
            openRouterGenerationId = fromBody;
            console.log('📊 OpenRouter: generation id from response body:', openRouterGenerationId.slice(0, 28) + '...');
          } else {
            const topKeys = typeof completionJson === 'object' && completionJson !== null ? Object.keys(completionJson as object).join(', ') : '—';
            console.warn('📊 OpenRouter: no gen id in header or body. Response keys:', topKeys, '| completion.id:', (completion as { id?: string })?.id ?? '—');
          }
        }
        if (completion == null) throw new Error('OpenRouter failed to return a completion');
      } catch (apiError: any) {
        console.error('❌ OpenRouter request failed:', apiError?.message ?? apiError);
        throw apiError;
      }
    } else {
      try {
        completion = await client.chat.completions.create(requestParams);
      } catch (apiError: any) {
        console.error('❌ OpenAI API Error Details:');
        console.error('   Status:', apiError?.status);
        console.error('   Message:', apiError?.message);
        console.error('   Code:', apiError?.code);
        console.error('   Type:', apiError?.type);
        console.error('   Param:', apiError?.param);
        if (apiError?.error) {
          console.error('   Error Object:', JSON.stringify(apiError.error, null, 2));
        }
        if (apiError?.response) {
          console.error('   Response:', JSON.stringify(apiError.response, null, 2));
        }
        throw apiError; // Re-throw to be caught by outer catch
      }
    }

    if (completion == null) throw new Error('No completion from API');
    // Log the actual model used by OpenAI (in case of model fallback)
    const actualModel = completion.model;
    const msg = completion.choices[0]?.message as unknown as Record<string, unknown> | undefined;


    // Get response text: prefer content; some OpenRouter models (e.g. Kimi K2.5) put output in reasoning
    let response: string = '';
    const rawContent = msg?.content;
    if (typeof rawContent === 'string') {
      response = rawContent;
    } else if (Array.isArray(rawContent)) {
      response = (rawContent as { type?: string; text?: string }[])
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('');
    }
    if (!response?.trim() && msg) {
      const reasoning = msg.reasoning;
      if (typeof reasoning === 'string' && reasoning.trim()) {
        response = reasoning.trim();
      } else if (Array.isArray(msg.reasoning_details)) {
        const parts = (msg.reasoning_details as { type?: string; text?: string }[])
          .filter((p) => p?.type === 'reasoning.text' && typeof p.text === 'string')
          .map((p) => p.text);
        if (parts.length) response = parts.join('\n').trim();
      }
    }
    if (!response?.trim()) {
      console.error('📄 Raw completion.choices[0]:', JSON.stringify(completion.choices?.[0], null, 2));
      throw new Error('No response from OpenAI');
    }

    let jsonString = response.trim();
    // Remove markdown code blocks if present
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Try to extract a JSON object if the response is prose with embedded JSON (e.g. reasoning models)
    const extractSummaryJson = (text: string): string | null => {
      const codeBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlock) return codeBlock[1].trim();
      const lastBrace = text.lastIndexOf('}');
      if (lastBrace !== -1) {
        for (let i = lastBrace; i >= 0; i--) {
          if (text[i] !== '{') continue;
          const slice = text.slice(i, lastBrace + 1);
          try {
            const o = JSON.parse(slice);
            if (o && typeof o === 'object' && ('summary' in o || ('summary' in o && 'impact' in o))) return slice;
          } catch {
            // continue
          }
        }
      }
      return null;
    }

    /** If the model hit max_tokens, JSON can be cut off (unclosed "details" string). Try to close it and parse. */
    const repairTruncatedSummaryJson = (raw: string): string | null => {
      const t = raw.trim();
      if (!t.startsWith('{') || !t.includes('"summary"')) return null;
      let inString = false;
      let escape = false;
      let lastGood = -1;
      for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (c === '\\' && inString) {
          escape = true;
          continue;
        }
        if (c === '"') {
          inString = !inString;
          if (!inString) lastGood = i;
          continue;
        }
      }
      if (inString && lastGood >= 0) {
        let truncated = t.slice(0, lastGood + 1);
        truncated = truncated.replace(/,(\s*)$/, '$1'); // no trailing comma
        const openBraces = (truncated.match(/\{/g)?.length ?? 0) - (truncated.match(/\}/g)?.length ?? 0);
        const repaired = truncated + '}'.repeat(Math.max(0, openBraces) + 1);
        return repaired;
      }
      return null;
    };

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      const extracted = extractSummaryJson(response);
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch {
          // ignore
        }
      }
      if (parsed == null || typeof parsed !== 'object') {
        const repaired = repairTruncatedSummaryJson(jsonString);
        if (repaired) {
          try {
            parsed = JSON.parse(repaired);
          } catch {
            // ignore
          }
        }
      }
    }
    if (parsed == null || typeof parsed !== 'object') {
      console.error('❌ Failed to parse AI response as JSON');
      console.error('📄 Raw AI response (first 500 chars):', jsonString.slice(0, 500));
      throw new Error('Failed to parse AI response: no valid JSON found');
    }
    
    // Unwrap if model returned { "summary": { summary, impact, category, details } } (common with some OpenRouter models)
    let summary: CodeSummary;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'summary' in parsed &&
      parsed.summary &&
      typeof parsed.summary === 'object' &&
      'summary' in parsed.summary &&
      'impact' in parsed.summary &&
      'category' in parsed.summary
    ) {
      summary = parsed.summary as CodeSummary;
    } else if (parsed && typeof parsed === 'object' && 'summary' in parsed && 'impact' in parsed && 'category' in parsed) {
      summary = parsed as CodeSummary;
    } else {
      console.error('❌ Invalid AI response structure:', parsed);
      throw new Error('AI response missing required fields');
    }
    
    // Validate summary structure
    if (!summary.summary || !summary.impact || !summary.category) {
      console.error('❌ Invalid AI response structure:', summary);
      throw new Error('AI response missing required fields');
    }
    if (typeof summary.details !== 'string') {
      summary.details = summary.summary || '';
    }

    // Calculate usage and cost
    let tokensUsed = completion.usage?.total_tokens || 0;
    const usage = completion.usage as { total_tokens?: number; cost?: number } | undefined;
    let cost: number;
    if (useOpenRouter && typeof usage?.cost === 'number' && usage.cost > 0) {
      // OpenRouter returned a non-zero cost in the completion response (USD); store in units of $0.0001
      cost = Math.round(usage.cost * 10000);
    } else if (useUserOpenAi) {
      // User's OpenAI key — they pay OpenAI directly; no PushLog cost/credits
      cost = 0;
    } else if (!useOpenRouter) {
      // PushLog credits (default OpenAI client)
      cost = calculateTokenCost(model, tokensUsed);
    } else if (useOpenRouter && options?.openRouterApiKey) {
      // OpenRouter didn't include cost in response; fetch by generation ID from header (gen-xxx) or fallback to completion.id
      const genId = openRouterGenerationId || completion.id;
      if (genId) {
        if (!openRouterGenerationId && completion.id) {
          console.log('📊 OpenRouter: using completion.id for cost lookup (header had no gen id):', String(completion.id).slice(0, 24) + '...');
        }
        const genUsage = await fetchOpenRouterGenerationUsage(genId, options.openRouterApiKey);
        if (genUsage) {
          if (genUsage.tokensUsed > 0) tokensUsed = genUsage.tokensUsed;
          cost = genUsage.costCents;
          if (cost > 0 || tokensUsed > 0) {
            console.log(`📊 OpenRouter generation lookup - Id: ${genId.slice(0, 28)}..., Tokens: ${tokensUsed}, Cost: $${(cost / 10000).toFixed(4)}`);
          }
        } else {
          console.warn('📊 OpenRouter: generation lookup returned no usage/cost (id may be chatcmpl-xxx; API expects gen-xxx). Check https://openrouter.ai/activity for actual cost.');
          cost = 0;
        }
      } else {
        console.warn('📊 OpenRouter: no generation id or completion.id; cost set to 0. Generation id is often stripped by CDN (e.g. Cloudflare). See https://openrouter.ai/activity for actual usage.');
        cost = 0;
      }
    } else {
      cost = 0;
    }

    console.log(`✅ AI summary generated - Model: ${actualModel}, Tokens: ${tokensUsed}, Cost: $${(cost / 10000).toFixed(4)}${useOpenRouter && openRouterGenerationId ? `, OpenRouter gen id: ${openRouterGenerationId.slice(0, 20)}...` : ''}`);
    
    return {
      summary,
      tokensUsed,
      cost,
      actualModel, // Include the actual model used
      openrouterGenerationId: openRouterGenerationId ?? null,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ AI summary failed for model ${model}: ${errMsg}`);
    console.error('📊 Model attempted:', model);
    console.error('📊 Error details:', {
      message: errMsg,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    console.error('📊 Push data:', {
      repository: pushData.repositoryName,
      branch: pushData.branch,
      filesChanged: pushData.filesChanged.length,
      additions: pushData.additions,
      deletions: pushData.deletions
    });

    const openRouterErrorMsg = (error instanceof Error && String(error.message).includes('OpenRouter')) ? (error instanceof Error ? error.message : String(error)) : undefined;
    if (openRouterErrorMsg) {
      console.warn('📬 [AI] OpenRouter error captured for in-app notification:', openRouterErrorMsg.slice(0, 100));
      // Create in-app notification and broadcast so the user sees it in the notification dropdown
      const ctx = options?.notificationContext;
      if (ctx) {
        try {
          const openRouterNotif = await storage.createNotification({
            userId: ctx.userId,
            type: 'openrouter_error',
            title: 'OpenRouter error',
            message: openRouterErrorMsg.slice(0, 500),
            metadata: JSON.stringify({
              repositoryName: ctx.repositoryName,
              integrationId: ctx.integrationId,
              slackChannelName: ctx.slackChannelName,
            }),
          });
          console.warn('📬 [AI] Created OpenRouter error notification for user', ctx.userId, 'id:', openRouterNotif.id);
          broadcastNotification(ctx.userId, {
            id: openRouterNotif.id,
            type: 'openrouter_error',
            title: openRouterNotif.title,
            message: openRouterNotif.message,
            metadata: openRouterNotif.metadata,
            createdAt: openRouterNotif.createdAt,
            isRead: false,
          });
        } catch (notifErr) {
          console.warn('⚠️ [AI] Failed to create/broadcast OpenRouter error notification:', notifErr);
        }
      }
    }

    // Fallback summary if AI fails (use correct additions/deletions values)
    return {
      summary: {
        summary: `Updated ${pushData.filesChanged.length} files with ${pushData.additions || 0} additions and ${pushData.deletions || 0} deletions`,
        impact: 'medium',
        category: 'other',
        details: `Changes made to ${pushData.filesChanged.join(', ')}`
      },
      tokensUsed: 0,
      cost: 0,
      isFallback: true,
      openRouterError: openRouterErrorMsg,
    };
  }
}

export async function generateSlackMessage(pushData: PushEventData, summary: CodeSummary): Promise<string> {
  const impactEmoji = {
    low: ':large_green_circle:',
    medium: ':large_yellow_circle:', 
    high: ':red_circle:'
  };

  const categoryEmoji: Record<string, string> = {
    feature: ':sparkles:',
    bugfix: ':bug:',
    refactor: ':wrench:',
    docs: ':books:',
    test: ':test_tube:',
    security: ':shield:',
    other: ':memo:'
  };

  // Ensure impact is a valid key, default to medium if not
  const impact = (summary.impact && impactEmoji[summary.impact]) ? summary.impact : 'medium';
  const category = summary.category || 'other';
  const emoji = categoryEmoji[category] ?? categoryEmoji.other;

  return `*${pushData.repositoryName}* - ${pushData.branch} branch 

${impactEmoji[impact]} *${summary.summary}*

${emoji} *${category.toUpperCase()}* | :bar_chart: +${pushData.additions} -${pushData.deletions} lines
${summary.details}

🔗 <https://github.com/${pushData.repositoryName}/commit/${pushData.commitSha}|View Commit>`;
}