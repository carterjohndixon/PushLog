import type Stripe from "stripe";
import { stripe, isBillingEnabled } from "./stripe";
import { databaseStorage } from "./database";

/** Stripe Node types use camelCase; webhook payloads use snake_case. */
function subscriptionPeriodEndUnix(sub: Stripe.Subscription): number {
  const raw = sub as unknown as { current_period_end?: number; currentPeriodEnd?: number };
  const v = raw.current_period_end ?? raw.currentPeriodEnd;
  return typeof v === "number" ? v : 0;
}

function pickRelevantSubscription(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  if (!subs.length) return null;
  const byStatus = (st: Stripe.Subscription.Status) => subs.find((s) => s.status === st);
  const nowSec = Math.floor(Date.now() / 1000);
  return (
    byStatus("active") ??
    byStatus("trialing") ??
    byStatus("past_due") ??
    subs.find((s) => s.status === "canceled" && subscriptionPeriodEndUnix(s) > nowSec) ??
    subs[0]
  );
}

export type OrgBillingPeriodSyncResult = {
  currentPeriodEnd: string;
  subscriptionStatus?: string;
};

/**
 * Ensures organizations.current_period_end is populated from Stripe when missing
 * (e.g. webhook gaps, or stripe_customer_id present without stripe_subscription_id).
 */
export async function syncOrganizationPeriodEndFromStripe(
  organizationId: string
): Promise<OrgBillingPeriodSyncResult | null> {
  if (!isBillingEnabled()) return null;

  const org = await databaseStorage.getOrganization(organizationId);
  if (!org) return null;

  const plan = String((org as { plan?: string }).plan || "free");
  const stripeSubscriptionId = (org as { stripeSubscriptionId?: string | null }).stripeSubscriptionId;
  const stripeCustomerId = (org as { stripeCustomerId?: string | null }).stripeCustomerId;

  const existingEnd = (org as { currentPeriodEnd?: string | null }).currentPeriodEnd;
  if (existingEnd) {
    return {
      currentPeriodEnd: existingEnd,
      subscriptionStatus: (org as { stripeSubscriptionStatus?: string | null }).stripeSubscriptionStatus ?? undefined,
    };
  }

  if (plan === "free" && !stripeSubscriptionId) {
    return null;
  }

  const persistFromSubscription = async (sub: Stripe.Subscription): Promise<OrgBillingPeriodSyncResult | null> => {
    const end = subscriptionPeriodEndUnix(sub);
    if (!end) return null;
    const iso = new Date(end * 1000).toISOString();
    const updates: Parameters<typeof databaseStorage.updateOrganization>[1] = {
      currentPeriodEnd: iso,
      stripeSubscriptionId: sub.id,
      stripeSubscriptionStatus: sub.status,
    };
    const priceId = sub.items?.data?.[0]?.price?.id;
    if (priceId) updates.stripePriceId = priceId;
    await databaseStorage.updateOrganization(organizationId, updates);
    return { currentPeriodEnd: iso, subscriptionStatus: sub.status };
  };

  if (stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      const out = await persistFromSubscription(sub);
      if (out) return out;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[syncOrganizationPeriodEndFromStripe] retrieve failed:", msg);
    }
  }

  if (stripeCustomerId) {
    try {
      const list = await stripe.subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 20 });
      const sub = pickRelevantSubscription(list.data);
      if (sub) {
        const out = await persistFromSubscription(sub);
        if (out) return out;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[syncOrganizationPeriodEndFromStripe] list failed:", msg);
    }
  }

  return null;
}
