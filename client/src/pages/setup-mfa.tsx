import * as React from "react";
import { Loader2, ShieldCheck, Lock, Smartphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { AuthLayout } from "@/components/auth-layout";

const setupFooter = (
  <>
    <a href="/" className="font-medium text-foreground hover:text-primary transition-colors">PushLog</a>
    <span className="mx-2">·</span>
    <span>Two-factor authentication</span>
  </>
);

export default function SetupMfa() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [code, setCode] = React.useState("");

  const { data, isLoading: setupLoading, error: setupError } = useQuery<{ qrDataUrl: string }>({
    queryKey: ["/api/mfa/setup"],
    queryFn: async () => {
      const res = await fetch("/api/mfa/setup", { credentials: "include", headers: { Accept: "application/json" } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setLocation("/login");
          throw new Error("Session expired. Please log in again.");
        }
        throw new Error(body.error || "Failed to load MFA setup");
      }
      return res.json();
    },
    retry: false,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/mfa/setup", { code });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.prefetchQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: fetchProfile });
      toast({ title: "MFA enabled", description: "Your account is now protected with two-factor authentication." });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({
        title: "Invalid code",
        description: err.message || "Please enter the correct 6-digit code from your authenticator app.",
        variant: "destructive",
      });
    },
  });

  const handleCodeChange = (value: string) => {
    setCode(value);
    if (value.length === 6 && !verifyMutation.isPending) {
      verifyMutation.mutate(value);
    }
  };

  if (setupLoading) {
    return (
      <AuthLayout backHref="/login" backLabel="Back to login" footer={setupFooter}>
        <div className="mx-auto w-full max-w-md text-center">
          <div className="bg-card border border-border shadow-xl rounded-2xl p-10 flex flex-col items-center justify-center gap-6">
            <div className="rounded-full bg-primary/10 p-4">
              <Loader2 className="w-10 h-10 text-log-green animate-spin" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Preparing your security setup</h2>
              <p className="text-sm text-muted-foreground">This will only take a moment…</p>
            </div>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (!data?.qrDataUrl) {
    return (
      <AuthLayout backHref="/login" backLabel="Back to login" footer={setupFooter}>
        <div className="mx-auto w-full max-w-md text-center space-y-6">
          <div className="bg-card border border-border shadow-xl rounded-2xl p-8 space-y-4">
            <div className="rounded-full bg-destructive/10 p-3 inline-flex">
              <ShieldCheck className="w-8 h-8 text-destructive" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Unable to load setup</h1>
            <p className="text-sm text-muted-foreground">
              {setupError instanceof Error ? setupError.message : "Please log in and try again."}
            </p>
            <Button variant="glow" className="w-full font-semibold" onClick={() => setLocation("/login")}>
              Back to login
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            <a href="/login" className="text-primary font-medium hover:underline">Return to login</a>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout backHref="/login" backLabel="Back to login" footer={setupFooter}>
      <div className="mx-auto max-w-2xl w-full space-y-8">
          {/* Hero */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Set up two-factor authentication
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Add an extra layer of security to your PushLog account. You’ll use an authenticator app to generate codes when you sign in.
            </p>
          </div>

          {/* Why 2FA callout */}
          <div className="rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-log-green" />
              Why use two-factor authentication?
            </h2>
            <ul className="grid gap-2 sm:grid-cols-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-log-green shrink-0 mt-0.5" />
                <span>Protects your account even if your password is compromised</span>
              </li>
              <li className="flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-log-green shrink-0 mt-0.5" />
                <span>Codes are generated on your device and stay with you</span>
              </li>
              <li className="flex items-start gap-2">
                <RefreshCw className="w-4 h-4 text-log-green shrink-0 mt-0.5" />
                <span>Industry-standard time-based codes (TOTP)</span>
              </li>
            </ul>
          </div>

          {/* Steps */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card shadow-xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-log-green text-white text-sm font-bold">
                  1
                </span>
                <h3 className="text-lg font-semibold text-foreground">Scan the QR code with your app</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Open Google Authenticator, Authy, 1Password, or another authenticator app and scan the code below.
              </p>
              <div className="flex justify-center">
                <div className="rounded-xl border-2 border-border bg-muted/30 p-5 inline-flex shadow-inner">
                  <img
                    src={data.qrDataUrl}
                    alt="Scan with your authenticator app"
                    className="rounded-lg"
                    width={220}
                    height={220}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-log-green text-white text-sm font-bold">
                  2
                </span>
                <h3 className="text-lg font-semibold text-foreground">Enter the 6-digit code</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter the code shown in your authenticator app. Codes update every 30 seconds.
              </p>
              <div className="flex justify-center pt-2">
                <InputOTP maxLength={6} value={code} onChange={handleCodeChange}>
                  <InputOTPGroup className="gap-2 sm:gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border-2 border-input bg-background text-center text-lg font-semibold transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 focus:ring-offset-2"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                variant="glow"
                className="w-full font-semibold mt-2"
                disabled={code.length !== 6 || verifyMutation.isPending}
                onClick={() => code.length === 6 && verifyMutation.mutate(code)}
              >
                {verifyMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify and enable two-factor"
                )}
              </Button>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            <a href="/login" className="text-primary font-medium hover:underline">Back to login</a>
          </p>
      </div>
    </AuthLayout>
  );
}
