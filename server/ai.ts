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
  /** Input/prompt tokens when provided by the API. */
  promptTokens?: number;
  /** Output/completion tokens when provided by the API. */
  completionTokens?: number;
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

/** Normalized result from OpenAI (Responses API or chat.completions fallback). No SDK-specific types. */
export interface NormalizedOpenAIResult {
  text: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

/**
 * Call OpenAI: Responses API first (with optional temperature retry), then chat.completions, then v1/completions.
 * Handles gpt-5.2-pro and other models that don't support temperature or are completions-only.
 */
async function callOpenAI(
  client: OpenAI,
  params: { model: string; instructions: string; input: string; max_output_tokens: number; temperature: number }
): Promise<NormalizedOpenAIResult> {
  const { model, instructions, input, max_output_tokens, temperature } = params;

  // 1) Try Responses API with temperature
  try {
    const resp = await client.responses.create({
      model,
      instructions: instructions || null,
      input,
      max_output_tokens,
      temperature,
    });
    const text = resp.output_text ?? '';
    const u = resp.usage;
    return {
      text,
      model: resp.model ?? model,
      usage: u
        ? {
            input_tokens: u.input_tokens,
            output_tokens: u.output_tokens,
            total_tokens: u.total_tokens,
            prompt_tokens: u.input_tokens,
            completion_tokens: u.output_tokens,
          }
        : undefined,
    };
  } catch (err: any) {
    const status = err?.status ?? err?.code;
    const message = String(err?.message ?? err ?? '');

    // 2) If 400 and temperature not supported, retry Responses API without temperature
    if (status === 400 && /temperature/i.test(message)) {
      try {
        const resp = await client.responses.create({
          model,
          instructions: instructions || null,
          input,
          max_output_tokens,
        });
        const text = resp.output_text ?? '';
        const u = resp.usage;
        return {
          text,
          model: resp.model ?? model,
          usage: u
            ? {
                input_tokens: u.input_tokens,
                output_tokens: u.output_tokens,
                total_tokens: u.total_tokens,
                prompt_tokens: u.input_tokens,
                completion_tokens: u.output_tokens,
              }
            : undefined,
        };
      } catch (_e2) {
        /* fall through to chat/completions */
      }
    }

    const isNotSupported =
      status === 400 ||
      status === 404 ||
      /not supported|completions endpoint|v1\/completions/i.test(message);
    if (!isNotSupported) throw err;

    // 3) Try chat.completions
    try {
      const chat = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: input },
        ],
        max_completion_tokens: max_output_tokens,
        temperature,
      });
      const msg = chat.choices[0]?.message;
      let text = '';
      if (typeof msg?.content === 'string') text = msg.content;
      else if (Array.isArray(msg?.content))
        text = (msg.content as { type?: string; text?: string }[])
          .filter((p) => p?.type === 'text' && typeof p.text === 'string')
          .map((p) => p.text)
          .join('');
      const u = chat.usage;
      return {
        text,
        model: chat.model ?? model,
        usage: u
          ? {
              input_tokens: u.prompt_tokens,
              output_tokens: u.completion_tokens,
              total_tokens: u.total_tokens,
              prompt_tokens: u.prompt_tokens,
              completion_tokens: u.completion_tokens,
            }
          : undefined,
      };
    } catch (chatErr: any) {
      const chatMsg = String(chatErr?.message ?? '');
      const isCompletionsOnly = /not a chat model|v1\/completions/i.test(chatMsg);
      if (isCompletionsOnly) {
        const prompt = [instructions, input].filter(Boolean).join('\n\n');
        const comp = await (client as any).completions.create({
          model,
          prompt,
          max_tokens: max_output_tokens,
        });
        const choice = comp.choices?.[0];
        const text = (typeof choice?.text === 'string' ? choice.text : '') || '';
        const u = comp.usage;
        return {
          text,
          model: comp.model ?? model,
          usage: u
            ? {
                input_tokens: u.prompt_tokens,
                output_tokens: u.completion_tokens,
                total_tokens: u.total_tokens,
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
              }
            : undefined,
        };
      }
      throw chatErr;
    }
  }
}

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
): Promise<{ tokensUsed: number; costCents: number; tokensPrompt?: number; tokensCompletion?: number } | null> {
  const idPrefix = generationId.startsWith('gen-') ? 'gen-xxx' : generationId.startsWith('chatcmpl-') ? 'chatcmpl-xxx' : 'other';
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
    return { tokensUsed, costCents, tokensPrompt: tokensPrompt || undefined, tokensCompletion: tokensCompletion || undefined };
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

    let openAIResult: NormalizedOpenAIResult | null = null;
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
      const systemContent = requestParams.messages.find((m: { role: string }) => m.role === 'system')?.content ?? '';
      const userContent = requestParams.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      openAIResult = await callOpenAI(client, {
        model,
        instructions: typeof systemContent === 'string' ? systemContent : String(systemContent),
        input: typeof userContent === 'string' ? userContent : String(userContent),
        max_output_tokens: effectiveMaxTokens,
        temperature: 0.3,
      });
    }

    // Normalized path: response text and usage from either OpenAI (openAIResult) or OpenRouter (completion)
    let response: string;
    let actualModel: string;
    let unifiedUsage: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    if (openAIResult) {
      response = openAIResult.text ?? '';
      actualModel = openAIResult.model;
      unifiedUsage = openAIResult.usage
        ? {
            total_tokens: openAIResult.usage.total_tokens ?? (openAIResult.usage.input_tokens ?? 0) + (openAIResult.usage.output_tokens ?? 0),
            prompt_tokens: openAIResult.usage.prompt_tokens ?? openAIResult.usage.input_tokens,
            completion_tokens: openAIResult.usage.completion_tokens ?? openAIResult.usage.output_tokens,
          }
        : undefined;
    } else if (completion) {
      actualModel = completion.model;
      const msg = completion.choices[0]?.message as unknown as Record<string, unknown> | undefined;
      const rawContent = msg?.content;
      if (typeof rawContent === 'string') response = rawContent;
      else if (Array.isArray(rawContent))
        response = (rawContent as { type?: string; text?: string }[])
          .filter((part) => part?.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join('');
      else response = '';
      if (!response?.trim() && msg?.reasoning) {
        const r = msg.reasoning;
        if (typeof r === 'string' && r.trim()) response = r.trim();
        else if (Array.isArray(msg.reasoning_details))
          response = (msg.reasoning_details as { type?: string; text?: string }[])
            .filter((p) => p?.type === 'reasoning.text' && typeof p.text === 'string')
            .map((p) => p.text)
            .join('\n')
            .trim();
      }
      const u = completion.usage as { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
      unifiedUsage = u ? { total_tokens: u.total_tokens, prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens } : undefined;
    } else {
      throw new Error('No completion from API');
    }
    if (!response?.trim()) {
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

    // Calculate usage and cost (unified usage from openAIResult or completion)
    let tokensUsed = unifiedUsage?.total_tokens || 0;
    let promptTokens: number | undefined = unifiedUsage?.prompt_tokens;
    let completionTokens: number | undefined = unifiedUsage?.completion_tokens;
    let cost: number;
    const usageForCost = completion ? (completion.usage as { total_tokens?: number; cost?: number } | undefined) : undefined;
    if (useOpenRouter && typeof usageForCost?.cost === 'number' && usageForCost.cost > 0) {
      // OpenRouter returned a non-zero cost in the completion response (USD); store in units of $0.0001
      cost = Math.round(usageForCost.cost * 10000);
    } else if (useUserOpenAi) {
      // User's OpenAI key — they pay OpenAI directly; no PushLog cost/credits
      cost = 0;
    } else if (!useOpenRouter) {
      // PushLog credits (default OpenAI client)
      cost = calculateTokenCost(model, tokensUsed);
    } else if (useOpenRouter && options?.openRouterApiKey) {
      // OpenRouter didn't include cost in response; fetch by generation ID from header (gen-xxx) or fallback to completion.id
      const genId = openRouterGenerationId || (completion as { id?: string } | undefined)?.id;
      if (genId) {
        const genUsage = await fetchOpenRouterGenerationUsage(genId, options.openRouterApiKey);
        if (genUsage) {
          if (genUsage.tokensUsed > 0) tokensUsed = genUsage.tokensUsed;
          cost = genUsage.costCents;
          if (genUsage.tokensPrompt != null) promptTokens = genUsage.tokensPrompt;
          if (genUsage.tokensCompletion != null) completionTokens = genUsage.tokensCompletion;
          if (cost > 0 || tokensUsed > 0) {
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
    
    return {
      summary,
      tokensUsed,
      promptTokens,
      completionTokens,
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

  const impact = (summary.impact && impactEmoji[summary.impact]) ? summary.impact : 'medium';
  const category = summary.category || 'other';
  const emoji = categoryEmoji[category] ?? categoryEmoji.other;

  return `*${pushData.repositoryName}* - ${pushData.branch} branch 

  ${impactEmoji[impact]} *${summary.summary}*

  ${emoji} *${category.toUpperCase()}* | :bar_chart: +${pushData.additions} -${pushData.deletions} lines
  ${summary.details}

  🔗 <https://github.com/${pushData.repositoryName}/commit/${pushData.commitSha}|View Commit>`;
}