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

type PlanName = "free" | "pro" | "team";

interface ProfileUser {
  id: number;
  plan?: PlanName;
}

const FREE_FEATURES = [
  "1 repository",
  "BYO API key",
  "Clean Summary mode only",
  "200 summaries/month",
  "No PushLog Agent",
];

const PRO_FEATURES = [
  "Up to 5 repositories",
  "Clean Summary, Slack-Friendly, Detailed Engineering, Executive Summary modes",
  "Sentry integration",
  "PushLog Agent (stream logs from your server)",
  "2,000 summaries/month",
];

const TEAM_FEATURES = [
  "Up to 20 repositories",
  "All Pro modes + Incident-Aware mode",
  "Incident-related features",
  "PushLog Agent (stream logs from your server)",
  "10,000 summaries/month",
];

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

  const handleCheckout = async (plan: "pro" | "team") => {
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free */}
            <Card
              className={`flex flex-col border-border outline-none focus:outline-none focus-visible:ring-0 ${
                isCurrentPlan("free") ? "ring-2 ring-log-green" : ""
              }`}
            >
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Free</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-foreground">$0</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                {isCurrentPlan("free") && (
                  <Badge variant="secondary" className="mt-2 w-fit">
                    Current Plan
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-3 mb-6">
                  {FREE_FEATURES.map((f) => (
                    <FeatureItem key={f} text={f} />
                  ))}
                </ul>
                <div className="mt-auto">
                  {isCurrentPlan("free") ? (
                    <Button variant="outline" className="w-full outline-none focus:outline-none focus-visible:ring-0" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Link
                      href="/signup"
                      className="block outline-none focus:outline-none focus-visible:ring-0 rounded-md"
                    >
                      <Button variant="outline" className="w-full outline-none focus:outline-none focus-visible:ring-0">
                        Get Started
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pro */}
            <Card
              className={`flex flex-col relative border-2 ${
                isCurrentPlan("pro")
                  ? "ring-2 ring-log-green border-log-green"
                  : "border-log-green"
              }`}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-log-green text-white hover:bg-log-green/90">
                  Most Popular
                </Badge>
              </div>
              <CardHeader className="pt-6 pb-4">
                <CardTitle className="text-xl">Pro</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-foreground">$12</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                {isCurrentPlan("pro") && (
                  <Badge variant="secondary" className="mt-2 w-fit">
                    Current Plan
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-3 mb-6">
                  {PRO_FEATURES.map((f) => (
                    <FeatureItem key={f} text={f} />
                  ))}
                </ul>
                <div className="mt-auto">
                  {isCurrentPlan("pro") ? (
                    <Button className="w-full bg-log-green" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-log-green hover:bg-log-green/90"
                      onClick={() => handleCheckout("pro")}
                      disabled={loadingPlan !== null}
                    >
                      {loadingPlan === "pro"
                        ? "Redirecting..."
                        : user
                          ? "Upgrade to Pro"
                          : "Sign up to subscribe"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Team */}
            <Card
              className={`flex flex-col border-border ${
                isCurrentPlan("team") ? "ring-2 ring-log-green" : ""
              }`}
            >
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Team</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-foreground">$39</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                {isCurrentPlan("team") && (
                  <Badge variant="secondary" className="mt-2 w-fit">
                    Current Plan
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-3 mb-6">
                  {TEAM_FEATURES.map((f) => (
                    <FeatureItem key={f} text={f} />
                  ))}
                </ul>
                <div className="mt-auto">
                  {isCurrentPlan("team") ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full border-log-green text-log-green hover:bg-log-green/10"
                      onClick={() => handleCheckout("team")}
                      disabled={loadingPlan !== null}
                    >
                      {loadingPlan === "team"
                        ? "Redirecting..."
                        : user
                          ? "Upgrade to Team"
                          : "Sign up to subscribe"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
