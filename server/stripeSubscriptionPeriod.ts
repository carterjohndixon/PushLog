import type Stripe from "stripe";

/**
 * End of the current billing period for a subscription (Unix seconds).
 *
 * Stripe Billing "Basil" (API 2025-08-27+) does not always expose
 * `current_period_end` on the Subscription root; it lives on each
 * {@link Stripe.SubscriptionItem} instead. Webhooks and older docs still
 * sometimes use the root field, so we support both.
 */
export function getSubscriptionCurrentPeriodEndUnix(sub: Stripe.Subscription): number {
  const loose = sub as unknown as { current_period_end?: number; currentPeriodEnd?: number };
  const top = loose.current_period_end ?? loose.currentPeriodEnd;
  if (typeof top === "number" && top > 0) return top;

  const items = sub.items?.data;
  if (items?.length) {
    const ends = items
      .map((it) => it.current_period_end)
      .filter((n): n is number => typeof n === "number" && n > 0);
    if (ends.length) return Math.max(...ends);
  }

  return 0;
}
