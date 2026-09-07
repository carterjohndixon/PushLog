/**
 * Optional product surfaces, read at runtime from the environment.
 *
 * PushLog's core product is Slack commit notifications. Organizations/teams and
 * incident reporting are shipped but switched off by default, so a fresh deploy is
 * the simple product. The code stays in the tree — these flags decide whether it is
 * reachable.
 *
 * - Unset / empty / anything falsy → **off**
 * - `true`, `1`, `yes`, `on` → **on**
 *
 * The client mirrors these as VITE_ORGANIZATION_ON / VITE_INCIDENTS_ON (baked at
 * build time, see client/src/lib/features.ts). Set both halves together: hiding a
 * feature in the UI while its API answers is not the same as turning it off.
 */
import type { Request, Response, NextFunction } from "express";

function flagEnabled(raw: string | undefined): boolean {
  if (raw === undefined || raw === null || raw.trim() === "") return false;
  const s = raw.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

/** Teams, invites, seats, per-repo membership, organization endpoints. */
export const ORGANIZATION_ON = flagEnabled(process.env.ORGANIZATION_ON);

/** Incident reporting: the PushLog agent, Sentry webhooks, incident/risk engines. */
export const INCIDENTS_ON = flagEnabled(process.env.INCIDENTS_ON);

/**
 * Express guard for routes belonging to a disabled feature. Responds 404 rather than
 * 403: a feature that is off should look absent, not forbidden, so probing the API
 * tells you nothing about what the deployment could do.
 */
export function requireFeature(enabled: boolean, feature: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!enabled) {
      return res.status(404).json({ error: "Not found", feature, enabled: false });
    }
    next();
  };
}

export function logFeatureFlags(log: (msg: string) => void = console.log): void {
  log(
    `[features] organizations=${ORGANIZATION_ON ? "on" : "off"} incidents=${INCIDENTS_ON ? "on" : "off"}`,
  );
}
