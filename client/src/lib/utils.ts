import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Known OpenAI (and similar) model IDs to human-readable display names. */
const AI_MODEL_DISPLAY_NAMES: Record<string, string> = {
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4-turbo": "GPT-4 Turbo",
  "gpt-4": "GPT-4",
  "gpt-3.5-turbo": "GPT-3.5 Turbo",
  "gpt-5.2": "GPT-5.2",
  "gpt-5.1": "GPT-5.1",
  // Dated variants (API often returns e.g. gpt-4o-2024-08-06)
  "gpt-4o-2024-08-06": "GPT-4o",
  "gpt-4o-2024-05-13": "GPT-4o",
  "gpt-4o-mini-2024-07-18": "GPT-4o Mini",
  "gpt-4-turbo-2024-04-09": "GPT-4 Turbo",
  "gpt-3.5-turbo-0125": "GPT-3.5 Turbo",
  "gpt-3.5-turbo-1106": "GPT-3.5 Turbo",
};

/**
 * Returns a human-readable display name for an AI model ID.
 * e.g. "gpt-4o-2024-08-06" -> "GPT-4o"
 */
export function getAiModelDisplayName(modelId: string | null | undefined): string {
  if (modelId == null || modelId === "") return "";
  const trimmed = modelId.trim();
  const known = AI_MODEL_DISPLAY_NAMES[trimmed];
  if (known) return known;
  // Strip date suffix like -2024-08-06 or -0125 and look up again
  const withoutDate = trimmed.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-\d{4}$/, "");
  const knownWithoutDate = AI_MODEL_DISPLAY_NAMES[withoutDate];
  if (knownWithoutDate) return knownWithoutDate;
  // OpenRouter-style "provider/model" (e.g. openai/gpt-4o, anthropic/claude-3.5-sonnet)
  if (trimmed.includes("/")) {
    const [provider, model] = trimmed.split("/");
    const providerLabel = provider.charAt(0).toUpperCase() + (provider.slice(1).toLowerCase() || "");
    const modelDisplay = getAiModelDisplayName(model) || model.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
    return modelDisplay ? `${providerLabel}: ${modelDisplay}` : providerLabel;
  }
  // Fallback: use base id (without date) and format nicely
  const base = trimmed.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-\d{4}$/, "");
  const parts = base.split("-");
  if (parts.length === 0) return trimmed;
  const first = parts[0].toUpperCase();
  const rest = parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  return [first, ...rest].join(" ");
}

export function handleTokenExpiration(error: any, queryClient?: any) {
  // DEPRECATED: This function is kept for backward compatibility but no longer redirects.
  // Redirects are now handled by:
  // 1. ProtectedRoute component (for route-level auth checks)
  // 2. queryClient.ts handleAuthenticationFailure (for API-level 401 errors)
  // 
  // This function now only clears localStorage (for old JWT tokens) and invalidates queries.
  // It does NOT redirect to prevent duplicate redirects and redirect loops.
  
  const isTokenExpired = 
    error?.message?.includes('expired') ||
    error?.message?.includes('unauthorized') ||
    error?.message?.includes('Authentication required') ||
    error?.status === 401 ||
    error?.statusCode === 401;

  if (isTokenExpired) {
    // Clear old JWT tokens from localStorage (if any exist from before session migration)
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    
    // Invalidate all queries to clear cached data
    if (queryClient) {
      queryClient.clear();
    }
    
    // DO NOT redirect here - let ProtectedRoute or queryClient handle it
    // Redirecting here causes duplicate redirects and can create redirect loops
    
    return true; // Indicates token was expired
  }
  
  return false; // Token was not expired
}
