/**
 * OpenAI model pricing and cost calculation (usage-based and display).
 * Used for cost-per-generation from API usage and for credit/display estimates.
 * No Stripe dependency.
 */

export interface AiModel {
  id: string;
  name: string;
  costPerToken: number; // cost per 1000 tokens in cents
  maxTokens: number;
  description: string;
}

/** Models used for credit deduction and fallback display cost (single rate per 1K tokens). */
export const AI_MODELS: AiModel[] = [
  { id: 'gpt-5.2', name: 'GPT-5.2', costPerToken: 25, maxTokens: 128000, description: 'Latest GPT-5.2 model with cutting-edge features (Latest & Recommended)' },
  { id: 'gpt-5.1', name: 'GPT-5.1', costPerToken: 20, maxTokens: 128000, description: 'Improved GPT-5.1 with better performance' },
  { id: 'gpt-4o', name: 'GPT-4o', costPerToken: 5, maxTokens: 128000, description: 'Most advanced GPT-4 model with improved performance and lower cost' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', costPerToken: 3, maxTokens: 128000, description: 'Faster and more affordable GPT-4o variant' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', costPerToken: 10, maxTokens: 128000, description: 'GPT-4 Turbo with extended context window' },
  { id: 'gpt-4', name: 'GPT-4', costPerToken: 30, maxTokens: 8192, description: 'Original GPT-4 model for complex analysis' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', costPerToken: 1, maxTokens: 16385, description: 'Fast and cost-effective for most use cases' },
];

/** OpenAI pricing per 1M tokens (USD) for cost-from-usage. Align with client OPENAI_PRICING where possible. */
const OPENAI_PRICING_PER_1M: Record<string, { inputUsdPer1M: number; outputUsdPer1M: number }> = {
  'gpt-3.5-turbo': { inputUsdPer1M: 0.5, outputUsdPer1M: 1.5 },
  'gpt-4': { inputUsdPer1M: 30, outputUsdPer1M: 60 },
  'gpt-4-turbo': { inputUsdPer1M: 10, outputUsdPer1M: 30 },
  'gpt-4o': { inputUsdPer1M: 2.5, outputUsdPer1M: 10 },
  'gpt-4o-mini': { inputUsdPer1M: 0.15, outputUsdPer1M: 0.6 },
  'gpt-4.1': { inputUsdPer1M: 2.5, outputUsdPer1M: 10 },
  'gpt-4.1-mini': { inputUsdPer1M: 0.4, outputUsdPer1M: 1.6 },
  'gpt-4.1-nano': { inputUsdPer1M: 0.1, outputUsdPer1M: 0.4 },
  'gpt-5.2': { inputUsdPer1M: 2.5, outputUsdPer1M: 10 },
  'gpt-5.1': { inputUsdPer1M: 2, outputUsdPer1M: 8 },
  'o1': { inputUsdPer1M: 15, outputUsdPer1M: 60 },
  'o1-mini': { inputUsdPer1M: 3, outputUsdPer1M: 12 },
  'o3': { inputUsdPer1M: 4, outputUsdPer1M: 16 },
  'o3-mini': { inputUsdPer1M: 1.1, outputUsdPer1M: 4.4 },
  'o4-mini': { inputUsdPer1M: 1.1, outputUsdPer1M: 4.4 },
};

function getOpenAiPricingForCost(modelId: string): { inputUsdPer1M: number; outputUsdPer1M: number } | null {
  const id = (modelId || '').toLowerCase().trim();
  if (!id) return null;
  if (OPENAI_PRICING_PER_1M[id]) return OPENAI_PRICING_PER_1M[id];
  const prefixMatch = Object.keys(OPENAI_PRICING_PER_1M)
    .filter(k => id === k || id.startsWith(k + '-') || id.startsWith(k + '.'))
    .sort((a, b) => b.length - a.length)[0];
  return prefixMatch ? OPENAI_PRICING_PER_1M[prefixMatch] : null;
}

/**
 * Cost from OpenAI API usage (prompt_tokens + completion_tokens). Returns cost in units of $0.0001.
 * Use when the API returned usage breakdown; otherwise use estimateTokenCostForDisplay with total tokens.
 */
export function estimateTokenCostFromUsage(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const p = getOpenAiPricingForCost(modelId);
  if (!p || (promptTokens <= 0 && completionTokens <= 0)) return 0;
  const inputUsd = (promptTokens / 1_000_000) * p.inputUsdPer1M;
  const outputUsd = (completionTokens / 1_000_000) * p.outputUsdPer1M;
  return Math.ceil((inputUsd + outputUsd) * 10000);
}

/** Cost for PushLog credits (exact model id required). Cost in units of $0.0001. */
export function calculateTokenCost(modelId: string, tokensUsed: number): number {
  const model = AI_MODELS.find(m => m.id === modelId);
  if (!model) throw new Error('Invalid AI model');
  return Math.ceil((tokensUsed / 1000) * model.costPerToken * 100);
}

/** Estimated cost for display when user pays OpenAI directly. Uses prefix match. Returns 0 for unknown models. Cost in units of $0.0001. */
export function estimateTokenCostForDisplay(modelId: string, tokensUsed: number): number {
  const id = (modelId || '').toLowerCase().trim();
  if (!id || tokensUsed <= 0) return 0;
  const model = AI_MODELS.find(m => id === m.id || id.startsWith(m.id + '-') || id.startsWith(m.id + '.'))
    ?? AI_MODELS.slice().sort((a, b) => b.id.length - a.id.length).find(m => id.includes(m.id));
  if (!model) return 0;
  return Math.ceil((tokensUsed / 1000) * model.costPerToken * 100);
}
