import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { Link } from "wouter";
import { CreditCard } from "lucide-react";
import { PageLoadingOverlay } from "@/components/page-loading";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function PlanBadge({ plan }: { plan: "free" | "pro" | "team" }) {
  const label = plan.charAt(0).toUpperCase() + plan.slice(1);
  const variant =
    plan === "free"
      ? "secondary"
      : plan === "pro"
        ? "default"
        : "default";
  return (
    <Badge
      variant={variant}
      className={
        plan === "pro" || plan === "team"
          ? "bg-log-green text-white border-0 text-lg px-4 py-1.5"
          : "text-lg px-4 py-1.5"
      }
    >
      {label}
    </Badge>
  );
}

export default function Billing() {
  const { toast } = useToast();

  const { data: profileResponse, isLoading, isError, error } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    refetchOnMount: "always",
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/create-portal-session");
      const data = await res.json();
      if (!data?.url) throw new Error("No portal URL returned");
      return data as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast({
        title: "Could not open billing portal",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const user = profileResponse?.user;
  const plan = user?.plan ?? "free";
  const subscriptionStatus = user?.subscriptionStatus;
  const currentPeriodEnd = user?.currentPeriodEnd;
  const monthlySummaryCount = user?.monthlySummaryCount ?? 0;
  const monthlySummaryCap = user?.monthlySummaryCap ?? 0;
  const usagePercent =
    monthlySummaryCap > 0 ? (monthlySummaryCount / monthlySummaryCap) * 100 : 0;

  if (isError) {
    return (
      <div className="min-h-screen flex flex-col bg-forest-gradient relative">
        <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
          <div className="text-center py-12">
            <p className="text-destructive font-medium">
              Failed to load billing information
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              {error instanceof Error ? error.message : "Please try again later"}
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-forest-gradient relative">
      <PageLoadingOverlay isVisible={isLoading} message="Loading billing..." />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-graphite mb-2 flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-log-green" />
            Billing
          </h1>
          <p className="text-steel-gray">
            Manage your subscription and billing details
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Current plan</CardTitle>
              <CardDescription>
                Your organization&apos;s subscription plan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <PlanBadge plan={plan} />
              </div>
              {subscriptionStatus && (
                <div>
                  <p className="text-sm text-muted-foreground">Subscription status</p>
                  <p className="font-medium capitalize">
                    {subscriptionStatus.replace(/_/g, " ")}
                  </p>
                </div>
              )}
              {currentPeriodEnd && (
                <div>
                  <p className="text-sm text-muted-foreground">Current period ends</p>
                  <p className="font-medium">{formatDate(currentPeriodEnd)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {monthlySummaryCap > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Monthly summary usage</CardTitle>
                <CardDescription>
                  AI summaries used this billing period
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {monthlySummaryCount.toLocaleString()} of{" "}
                    {monthlySummaryCap.toLocaleString()} used
                  </span>
                  {monthlySummaryCap > 0 && (
                    <span className="font-medium">
                      {Math.round(usagePercent)}%
                    </span>
                  )}
                </div>
                <Progress value={Math.min(usagePercent, 100)} className="h-2" />
              </CardContent>
            </Card>
          )}

          {plan === "free" && (
            <Card className="border-log-green/30 bg-log-green/5">
              <CardHeader>
                <CardTitle>Upgrade to Pro or Team</CardTitle>
                <CardDescription>
                  Unlock more AI summaries, advanced features, and team
                  collaboration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/pricing">
                  <Button className="bg-log-green hover:bg-log-green/90 text-white">
                    View plans
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Manage billing</CardTitle>
              <CardDescription>
                Update payment method, view invoices, or cancel subscription
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="default"
                  className="bg-log-green hover:bg-log-green/90"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending || plan === "free"}
                >
                  {portalMutation.isPending ? "Opening..." : "Manage Billing"}
                </Button>
                <Link href="/pricing">
                  <Button variant="outline">Change Plan</Button>
                </Link>
              </div>
              {plan === "free" && (
                <p className="text-sm text-muted-foreground">
                  Subscribe to a plan first to manage billing in the Stripe
                  portal.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
