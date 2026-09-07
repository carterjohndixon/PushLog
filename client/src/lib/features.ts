/**
 * Optional product surfaces (Vite: `VITE_ORGANIZATION_ON`, `VITE_INCIDENTS_ON`).
 * Baked at build time — set in env when running `vite build` / the Docker frontend build.
 *
 * PushLog's core product is Slack commit notifications. Organizations/teams and
 * incident reporting are shipped but switched off, so the app a customer sees stays
 * simple. Nothing here deletes those features: flip the flag and they return.
 *
 * - Unset / empty / anything falsy → **off**
 * - `true`, `1`, `yes`, `on` → **on**
 *
 * The server enforces the same two flags at runtime (see server/features.ts); this
 * module only decides what the UI offers. Keep the two in sync — a UI that hides a
 * feature whose API is live is a half-shipped feature, not a disabled one.
 */
function flagEnabled(raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === "") return false;
  const s = String(raw).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

/** Teams, invites, seats, per-repo membership, the /organization page. */
export function isOrganizationEnabled(): boolean {
  return flagEnabled(import.meta.env.VITE_ORGANIZATION_ON);
}

/** Incident reporting: the PushLog agent, Sentry webhooks, incident/risk engines. */
export function isIncidentsEnabled(): boolean {
  return flagEnabled(import.meta.env.VITE_INCIDENTS_ON);
}
