/**
 * Stripe / plan / billing UI visibility (Vite: `VITE_IS_PAYING_ENABLED`).
 * Baked at build time — set in env when running `vite build` / Docker frontend build.
 *
 * - Unset / empty / anything falsy → **disabled** (hide billing, renewal, paid-plan CTAs).
 * - `true`, `1`, `yes`, `on` → **enabled**.
 *
 * Same flag as isBillingEnabled() in ./features; kept so existing call sites read naturally.
 */
import { isBillingEnabled } from "./features";

export function isPayingUiEnabled(): boolean {
  return isBillingEnabled();
}
