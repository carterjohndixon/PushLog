/**
 * Centralized billing / plan entitlement helpers.
 * Source of truth for plan limits. All enforcement goes through these functions.
 */

import type { PushLogMode } from "./pushlogModes";

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------

export type PlanName = "free" | "pro" | "team";

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
  pro: {
    repoLimit: 5,
    summaryCap: 2000,
    allowedModes: ["clean_summary", "slack_friendly", "detailed_engineering", "executive_summary"],
    sentryEnabled: true,
    incidentsEnabled: false,
    priceMonthly: 12,
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

export function stripePriceIdToPlan(priceId: string): PlanName | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return "pro";
  if (priceId === process.env.STRIPE_PRICE_TEAM_MONTHLY) return "team";
  return null;
}

export function planToStripePriceId(plan: PlanName): string | null {
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO_MONTHLY ?? null;
  if (plan === "team") return process.env.STRIPE_PRICE_TEAM_MONTHLY ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// Pure entitlement checks (no DB — caller provides data)
// ---------------------------------------------------------------------------

export function getPlanLimits(plan: PlanName): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export function isValidPlan(plan: string): plan is PlanName {
  return plan === "free" || plan === "pro" || plan === "team";
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
