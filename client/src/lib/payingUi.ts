/**
 * Stripe / plan / billing UI visibility (Vite: `VITE_IS_PAYING_ENABLED`).
 * Baked at build time — set in env when running `vite build` / Docker frontend build.
 *
 * - Unset / empty → treat as **enabled** (show billing & plans; backward compatible).
 * - `false`, `0`, `no`, `off` → **disabled** (hide billing, renewal, paid-plan CTAs).
 */
export function isPayingUiEnabled(): boolean {
  const v = import.meta.env.VITE_IS_PAYING_ENABLED;
  if (v === undefined || v === "") return true;
  const s = String(v).trim().toLowerCase();
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return true;
}
