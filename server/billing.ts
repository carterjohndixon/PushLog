/**
 * Centralized billing / plan entitlement helpers.
 * Source of truth for plan limits. All enforcement goes through these functions.
 */

import type { PushLogMode } from "./pushlogModes";

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------

/**
 * "team" is retained for organizations already on it and for when ORGANIZATION_ON
 * returns; it is not sold while orgs and incidents are off. The ladder customers
 * see today is free → standard → pro → scale.
 */
export type PlanName = "free" | "standard" | "pro" | "scale" | "team";

export interface PlanLimits {
  repoLimit: number;
  summaryCap: number;
  allowedModes: PushLogMode[];
  sentryEnabled: boolean;
  incidentsEnabled: boolean;
  priceMonthly: number; // dollars
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    repoLimit: 1,
    summaryCap: 200,
    allowedModes: ["clean_summary"],
    sentryEnabled: false,
    incidentsEnabled: false,
    priceMonthly: 0,
  },
  standard: {
    repoLimit: 3,
    summaryCap: 1000,
    allowedModes: ["clean_summary", "slack_friendly"],
    sentryEnabled: false,
    incidentsEnabled: false,
    priceMonthly: 9,
  },
  pro: {
    repoLimit: 10,
    summaryCap: 5000,
    allowedModes: ["clean_summary", "slack_friendly", "detailed_engineering", "executive_summary"],
    sentryEnabled: true,
    incidentsEnabled: false,
    priceMonthly: 19,
  },
  scale: {
    repoLimit: 25,
    summaryCap: 15000,
    allowedModes: ["clean_summary", "slack_friendly", "detailed_engineering", "executive_summary"],
    sentryEnabled: true,
    incidentsEnabled: false,
    priceMonthly: 49,
  },
  team: {
    repoLimit: 20,
    summaryCap: 10000,
    allowedModes: ["clean_summary", "slack_friendly", "detailed_engineering", "executive_summary", "incident_aware"],
    sentryEnabled: true,
    incidentsEnabled: true,
    priceMonthly: 39,
  },
};

// ---------------------------------------------------------------------------
// Env-var helpers for Stripe price mapping
// ---------------------------------------------------------------------------

/** Env var holding each paid plan's Stripe price id. Free has no price. */
const PLAN_PRICE_ENV: Partial<Record<PlanName, string>> = {
  standard: "STRIPE_PRICE_STANDARD_MONTHLY",
  pro: "STRIPE_PRICE_PRO_MONTHLY",
  scale: "STRIPE_PRICE_SCALE_MONTHLY",
  team: "STRIPE_PRICE_TEAM_MONTHLY",
};

export function stripePriceIdToPlan(priceId: string): PlanName | null {
  if (!priceId) return null;
  for (const [plan, envVar] of Object.entries(PLAN_PRICE_ENV) as [PlanName, string][]) {
    const configured = process.env[envVar];
    if (configured && priceId === configured) return plan;
  }
  return null;
}

export function planToStripePriceId(plan: PlanName): string | null {
  const envVar = PLAN_PRICE_ENV[plan];
  return envVar ? process.env[envVar] ?? null : null;
}

// ---------------------------------------------------------------------------
// Pure entitlement checks (no DB — caller provides data)
// ---------------------------------------------------------------------------

export function getPlanLimits(plan: PlanName): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export function isValidPlan(plan: string): plan is PlanName {
  return plan === "free" || plan === "standard" || plan === "pro" || plan === "scale" || plan === "team";
}

export function isModeAllowed(plan: PlanName, mode: PushLogMode): boolean {
  return getPlanLimits(plan).allowedModes.includes(mode);
}

export function isUnderRepoLimit(plan: PlanName, currentRepoCount: number): boolean {
  return currentRepoCount < getPlanLimits(plan).repoLimit;
}

export function isUnderSummaryCap(plan: PlanName, currentCount: number): boolean {
  return currentCount < getPlanLimits(plan).summaryCap;
}

export function isSentryAllowed(plan: PlanName): boolean {
  return getPlanLimits(plan).sentryEnabled;
}

export function isIncidentsAllowed(plan: PlanName): boolean {
  return getPlanLimits(plan).incidentsEnabled;
}
