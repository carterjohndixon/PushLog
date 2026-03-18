/**
 * Billing routes: Stripe Checkout, Customer Portal, and subscription webhook.
 */

import { Router, type Request, type Response } from "express";
import { stripe, isBillingEnabled, createStripeCustomer } from "../stripe";
import { databaseStorage } from "../database";
import { stripePriceIdToPlan, planToStripePriceId, type PlanName } from "../billing";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/billing/create-checkout-session
// ---------------------------------------------------------------------------
router.post("/create-checkout-session", authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!isBillingEnabled()) {
      return res.status(503).json({ error: "Billing is disabled" });
    }

    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const { plan } = req.body as { plan?: string };
    if (plan !== "pro" && plan !== "team") {
      return res.status(400).json({ error: "Invalid plan. Must be 'pro' or 'team'." });
    }

    const priceId = planToStripePriceId(plan);
    if (!priceId) {
      return res.status(500).json({ error: `Stripe price not configured for plan: ${plan}` });
    }

    const user = await databaseStorage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const orgId = (user as any).organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const org = await databaseStorage.getOrganization(orgId);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const currentPlan = (org as any).plan as PlanName | undefined;
    const hasActiveSubscription = !!(org as any).stripeSubscriptionId;
    if (hasActiveSubscription && currentPlan === plan) {
      return res.status(400).json({
        error: `You're already on the ${plan} plan. Use Manage billing to change or cancel your subscription.`,
      });
    }

    let customerId = (org as any).stripeCustomerId;
    if (!customerId) {
      const customer = await createStripeCustomer(user.email || "", user.username || "");
      customerId = customer.id;
      await databaseStorage.updateOrganization(orgId, { stripeCustomerId: customerId });
    }

    const appUrl = process.env.APP_URL || "https://pushlog.ai";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
      metadata: { organizationId: orgId, plan },
      // Also propagate metadata to the subscription object so later subscription webhooks
      // can update the correct org even if price->plan env mapping is missing.
      subscription_data: { metadata: { organizationId: orgId, plan } },
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Create checkout session error:", error?.message ?? error);
    res.status(500).json({ error: error?.message ?? "Failed to create checkout session" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/billing/create-portal-session
// ---------------------------------------------------------------------------
router.post("/create-portal-session", authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!isBillingEnabled()) {
      return res.status(503).json({ error: "Billing is disabled" });
    }

    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const user = await databaseStorage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const orgId = (user as any).organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const org = await databaseStorage.getOrganization(orgId);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const customerId = (org as any).stripeCustomerId;
    if (!customerId) {
      return res.status(400).json({ error: "No billing account. Subscribe to a plan first." });
    }

    const appUrl = process.env.APP_URL || "https://pushlog.ai";

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/billing`,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Create portal session error:", error?.message ?? error);
    res.status(500).json({ error: error?.message ?? "Failed to create portal session" });
  }
});

export default router;

// ---------------------------------------------------------------------------
// Stripe subscription webhook handler (called from index.ts with raw body)
// ---------------------------------------------------------------------------
export async function handleStripeSubscriptionWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  const contentLength = req.headers["content-length"];
  const bodyLen = req.body?.length ?? (typeof req.body === "string" ? Buffer.byteLength(req.body) : 0);
  console.log("[Stripe webhook] received", {
    hasSignature: !!sig,
    hasSecret: !!secret,
    bodyType: typeof req.body,
    bodyIsBuffer: Buffer.isBuffer(req.body),
    contentLengthHeader: contentLength,
    bodyLength: bodyLen,
    lengthsMatch: contentLength != null && String(bodyLen) === String(contentLength),
  });

  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  if (!req.body || !Buffer.isBuffer(req.body)) {
    console.error("[Stripe webhook] body is not a Buffer — raw body was not preserved (proxy or middleware may have parsed it)");
    res.status(400).json({ error: "Invalid webhook body: raw body required for signature verification" });
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, secret);
  } catch (err: any) {
    console.error("Stripe webhook signature verification failed:", err?.message);
    res.status(400).send(`Webhook Error: ${err?.message}`);
    return;
  }

  console.log("[Stripe webhook] event type:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        if (session.mode === "subscription" && session.metadata?.organizationId) {
          const orgId = session.metadata.organizationId;
          const subscriptionId = session.subscription as string;
          const sub = await stripe.subscriptions.retrieve(subscriptionId) as any;
          const priceId = sub.items?.data?.[0]?.price?.id ?? null;
          const mappedPlan = priceId ? stripePriceIdToPlan(priceId) : null;
          const sessionPlan = (session.metadata?.plan as string)?.toLowerCase() as PlanName | undefined;
          const plan: PlanName = (mappedPlan ?? (sessionPlan === "pro" || sessionPlan === "team" ? sessionPlan : undefined)) ?? "pro";

          const periodEnd = sub.current_period_end;
          console.log("[Stripe webhook] checkout.session.completed", {
            orgId,
            subscriptionId,
            priceId,
            mappedPlan,
            sessionPlan,
            plan,
            status: sub.status,
          });
          await databaseStorage.updateOrganization(orgId, {
            plan,
            stripeSubscriptionId: subscriptionId,
            stripeSubscriptionStatus: sub.status,
            stripePriceId: priceId,
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            stripeCustomerId: session.customer as string,
          });
          console.log("[Stripe webhook] updated org", orgId, "to plan", plan);
        } else {
          console.log("[Stripe webhook] checkout.session.completed skipped (no subscription or metadata)", {
            mode: session?.mode,
            hasOrgId: !!session?.metadata?.organizationId,
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as any;
        const priceId = sub.items?.data?.[0]?.price?.id ?? null;
        const mappedPlan = priceId ? stripePriceIdToPlan(priceId) : null;
        const subscriptionPlan = sub.metadata?.plan as PlanName | undefined;
        const plan = (mappedPlan ?? subscriptionPlan) as PlanName | undefined;

        // Prefer orgId from subscription metadata; fall back to customer lookup.
        const orgIdFromMeta = sub.metadata?.organizationId as string | undefined;
        const customerId = sub.customer as string | undefined;

        const org =
          (orgIdFromMeta ? await databaseStorage.getOrganization(orgIdFromMeta) : null) ??
          (customerId ? await databaseStorage.getOrganizationByStripeCustomerId(customerId) : null);

        if (org) {
          const periodEnd = sub.current_period_end;
          console.log("[Stripe webhook] customer.subscription.created/updated", {
            orgId: org.id,
            subscriptionId: sub.id,
            priceId,
            mappedPlan,
            subscriptionPlan,
            plan,
            status: sub.status,
          });
          await databaseStorage.updateOrganization(org.id, {
            ...(plan ? { plan } : {}),
            stripeSubscriptionId: sub.id,
            stripeSubscriptionStatus: sub.status,
            ...(priceId ? { stripePriceId: priceId } : {}),
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
        const customerId = sub.customer as string;
        const org = await databaseStorage.getOrganizationByStripeCustomerId(customerId);
        if (org) {
          await databaseStorage.updateOrganization(org.id, {
            plan: "free",
            stripeSubscriptionId: null,
            stripeSubscriptionStatus: "canceled",
            stripePriceId: null,
            currentPeriodEnd: null,
          });
        }
        break;
      }
    }
  } catch (err: any) {
    console.error("Stripe webhook handler error:", err?.message ?? err, err?.stack);
    res.status(500).json({ error: err?.message ?? "Webhook handler error" });
    return;
  }

  res.status(200).json({ received: true });
}
