import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { isPayingUiEnabled } from "@/lib/payingUi";
import { isIncidentsEnabled, isOrganizationEnabled } from "@/lib/features";

// Mirrors server/billing.ts. "team" stays so an org already on it renders as current.
type PlanName = "free" | "standard" | "pro" | "scale" | "team";

interface ProfileUser {
  id: number;
  plan?: PlanName;
}

/**
 * The ladder customers see. Kept in step with PLAN_LIMITS in server/billing.ts, which
 * remains the enforcement source of truth — this table only decides what is advertised.
 * "team" is deliberately absent: it sells organizations and incidents, both gated off.
 */
type Tier = {
  plan: PlanName;
  name: string;
  price: string;
  features: string[];
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    plan: "free",
    name: "Free",
    price: "$0",
    features: ["1 repository", "Clean Summary mode", "25 summaries/month"],
  },
  {
    plan: "standard",
    name: "Standard",
    price: "$9",
    features: [
      "Up to 3 repositories",
      "Clean Summary and Slack-Friendly modes",
      "100 summaries/month",
    ],
  },
  {
    plan: "pro",
    name: "Pro",
    price: "$19",
    highlight: true,
    features: [
      "Up to 10 repositories",
      "All four summary modes",
      "500 summaries/month",
      "Bring your own OpenRouter key for any model",
      "Sentry integration",
    ],
  },
  {
    plan: "scale",
    name: "Scale",
    price: "$49",
    features: [
      "Up to 25 repositories",
      "All four summary modes",
      "3,000 summaries/month",
      "Bring your own OpenRouter key for any model",
      "Sentry integration",
      "Priority support",
    ],
  },
];


/** Bullets describing incident machinery, hidden while those features are off. */
const INCIDENT_FEATURE = /pushlog agent|sentry|incident/i;

function visibleFeatures(features: string[]): string[] {
  return isIncidentsEnabled() ? features : features.filter((f) => !INCIDENT_FEATURE.test(f));
}

function FeatureItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="w-5 h-5 shrink-0 text-log-green mt-0.5" />
      <span className="text-muted-foreground text-sm">{text}</span>
    </li>
  );
}

export default function Pricing() {
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<PlanName | null>(null);

  const { data: user } = useQuery<ProfileUser | null>({
    queryKey: ["pricing-profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.success ? data.user : null;
    },
    retry: false,
  });

  const currentPlan = user?.plan ?? null;

  const handleCheckout = async (plan: Exclude<PlanName, "free">) => {
    if (!user) {
      window.location.href = "/signup";
      return;
    }
    if (currentPlan === plan) {
      return;
    }
    setLoadingPlan(plan);
    try {
      const res = await apiRequest("POST", "/api/billing/create-checkout-session", { plan });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (err) {
      toast({
        title: "Checkout failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  const isCurrentPlan = (plan: PlanName) => currentPlan === plan;

  if (!isPayingUiEnabled()) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 py-16 px-4 flex items-center justify-center">
          <p className="text-center text-muted-foreground max-w-md">
            Plan upgrades and self-service billing are not available in this deployment.
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-4">Pricing</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your workflow. Upgrade or downgrade anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TIERS.map((tier) => {
              const current = isCurrentPlan(tier.plan);
              const paidPlan = tier.plan === "free" ? null : tier.plan;
              return (
                <Card
                  key={tier.plan}
                  className={`flex flex-col relative ${
                    tier.highlight
                      ? `border-2 ${current ? "ring-2 ring-log-green border-log-green" : "border-log-green"}`
                      : `border-border ${current ? "ring-2 ring-log-green" : ""}`
                  }`}
                >
                  {tier.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-log-green text-white hover:bg-log-green/90">Most Popular</Badge>
                    </div>
                  )}
                  <CardHeader className="pt-6 pb-4">
                    <CardTitle className="text-xl">{tier.name}</CardTitle>
                    <div className="mt-2">
                      <span className="text-3xl font-bold text-foreground">{tier.price}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    {current && (
                      <Badge variant="secondary" className="mt-2 w-fit">
                        Current Plan
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-3 mb-6">
                      {visibleFeatures(tier.features).map((f) => (
                        <FeatureItem key={f} text={f} />
                      ))}
                    </ul>
                    <div className="mt-auto">
                      {current ? (
                        <Button className={`w-full ${tier.highlight ? "bg-log-green" : ""}`} variant={tier.highlight ? "default" : "outline"} disabled>
                          Current Plan
                        </Button>
                      ) : !paidPlan ? (
                        <Link href="/signup" className="block rounded-md no-focus-ring">
                          <Button variant="outline" className="w-full no-focus-ring" tabIndex={-1}>
                            Get Started
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          className={`w-full ${tier.highlight ? "bg-log-green hover:bg-log-green/90" : ""}`}
                          variant={tier.highlight ? "default" : "outline"}
                          onClick={() => handleCheckout(paidPlan)}
                          disabled={loadingPlan !== null}
                        >
                          {loadingPlan === tier.plan
                            ? "Redirecting..."
                            : user
                              ? `Upgrade to ${tier.name}`
                              : "Sign up to subscribe"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
