/**
 * Shared profile query: single source of truth for /api/profile.
 * All components use this key and shape so the cache is consistent and
 * profile is preloaded before protected pages render (no stale/wrong data).
 */

export const PROFILE_QUERY_KEY = ["/api/profile"] as const;

export interface ProfileUser {
  id: number;
  username: string;
  email: string | null;
  isUsernameSet?: boolean;
  emailVerified: boolean;
  githubConnected: boolean;
  googleConnected?: boolean;
  aiCredits?: number;
  hasOpenRouterKey?: boolean;
  /** Default OpenRouter AI model for new integrations (e.g. anthropic/claude-3.5-sonnet) */
  preferredAiModel?: string;
  /** Monthly AI spend budget in units of $0.0001 (display as userBudget / 10000); null = no budget */
  monthlyBudget?: number | null;
  /** When over budget: "free_model" = use free model; "skip_ai" = plain push, no AI */
  overBudgetBehavior?: "free_model" | "skip_ai";
  /** Enable test features (e.g. Simulate incident on Integrations) */
  devMode?: boolean;
  /** Receive incident alert emails (Sentry, spike, regression, etc.) */
  incidentEmailEnabled?: boolean;
}

export interface ProfileResponse {
  success: boolean;
  user: ProfileUser;
}

export class ProfileError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ProfileError";
  }
}

export async function fetchProfile(): Promise<ProfileResponse> {
  const res = await fetch("/api/profile", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 401) throw new ProfileError("Unauthorized", 401);
    throw new ProfileError("Failed to load profile", res.status);
  }
  const data = await res.json();
  return {
    success: !!data.success,
    user: data.user ?? data,
  };
}
