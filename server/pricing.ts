/**
 * Cost calculation and DB-backed pricing lookup for AI generations.
 * calculateCostUsd uses full precision; generation logging uses ai_model_pricing from DB.
 */

export interface CalculateCostUsdParams {
  inputTokens: number;
  outputTokens: number;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
}

/**
 * Compute cost in USD from token counts and per-1M rates.
 * Full precision; no aggressive rounding. UI can format.
 */
export function calculateCostUsd(params: CalculateCostUsdParams): number {
  const { inputTokens, outputTokens, inputUsdPer1M, outputUsdPer1M } = params;
  const inputUsd = (inputTokens / 1_000_000) * inputUsdPer1M;
  const outputUsd = (outputTokens / 1_000_000) * outputUsdPer1M;
  return inputUsd + outputUsd;
}

/** Parse numeric from DB (drizzle returns string for numeric columns). */
export function parseNumeric(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const n = Number(String(value).trim());
  return Number.isNaN(n) ? 0 : n;
}

export type CostPayload = {
  estimatedCostUsd: number | null;
  pricingId: string | null;
  pricingInputUsdPer1M: string | null;
  pricingOutputUsdPer1M: string | null;
  costStatus: "ok" | "missing_pricing" | "no_usage";
  /** Legacy cost in units of $0.0001 for backward compat. */
  costLegacy: number;
};

/**
 * Resolve pricing from DB, compute cost, and build payload for generation logging.
 * If usage is missing, returns cost_status 'no_usage'. If pricing not found, returns 'missing_pricing'.
 */
export async function resolveGenerationCost(
  getActivePricingForModel: (provider: string, modelId: string) => Promise<{ id: string; inputUsdPer1M: string | null; outputUsdPer1M: string | null } | null>,
  provider: string,
  modelId: string,
  promptTokens: number | null,
  completionTokens: number | null
): Promise<CostPayload> {
  const noUsage: CostPayload = {
    estimatedCostUsd: null,
    pricingId: null,
    pricingInputUsdPer1M: null,
    pricingOutputUsdPer1M: null,
    costStatus: "no_usage",
    costLegacy: 0,
  };
  const inputTokens = promptTokens ?? 0;
  const outputTokens = completionTokens ?? 0;
  if (inputTokens <= 0 && outputTokens <= 0) return noUsage;

  const pricing = await getActivePricingForModel(provider, modelId);
  if (!pricing) {
    return {
      estimatedCostUsd: null,
      pricingId: null,
      pricingInputUsdPer1M: null,
      pricingOutputUsdPer1M: null,
      costStatus: "missing_pricing",
      costLegacy: 0,
    };
  }

  const inputUsdPer1M = parseNumeric(pricing.inputUsdPer1M);
  const outputUsdPer1M = parseNumeric(pricing.outputUsdPer1M);
  const estimatedCostUsd = calculateCostUsd({
    inputTokens,
    outputTokens,
    inputUsdPer1M,
    outputUsdPer1M,
  });
  const costLegacy = Math.round(estimatedCostUsd * 10000);

  return {
    estimatedCostUsd,
    pricingId: pricing.id,
    pricingInputUsdPer1M: pricing.inputUsdPer1M ?? String(inputUsdPer1M),
    pricingOutputUsdPer1M: pricing.outputUsdPer1M ?? String(outputUsdPer1M),
    costStatus: "ok",
    costLegacy,
  };
}
