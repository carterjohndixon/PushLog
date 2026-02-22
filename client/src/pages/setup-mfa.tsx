import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";

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
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6 text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <div className="bg-card border border-border shadow-xl rounded-2xl p-8 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 text-log-green animate-spin" />
            <p className="text-muted-foreground">Preparing your security setup…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data?.qrDataUrl) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6 text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">Unable to load setup</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {setupError instanceof Error ? setupError.message : "Please log in and try again."}
          </p>
          <div className="bg-card border border-border shadow-xl rounded-2xl p-6 sm:p-8">
            <Button variant="glow" className="w-full font-semibold" onClick={() => setLocation("/login")}>
              Back to login
            </Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            <a href="/login" className="text-primary font-medium hover:underline">Return to login</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">
            Set up two-factor authentication
          </h1>
          <p className="text-sm text-muted-foreground">
            Add an extra layer of security to your PushLog account
          </p>
        </div>

        <div className="bg-card border border-border shadow-xl rounded-2xl p-6 sm:p-8 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <ShieldCheck className="w-5 h-5 text-log-green shrink-0" />
              <span>Step 1 — Scan with your app</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Open Google Authenticator, Authy, or another authenticator app and scan this QR code.
            </p>
            <div className="flex justify-center">
              <div className="rounded-xl border-2 border-border bg-muted/30 p-4 inline-flex">
                <img
                  src={data.qrDataUrl}
                  alt="Scan with your authenticator app"
                  className="rounded-lg"
                  width={200}
                  height={200}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-semibold">
                2
              </span>
              <span>Step 2 — Enter the 6-digit code</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the code shown in your authenticator app. It updates every 30 seconds.
            </p>
            <div className="flex justify-center">
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
          </div>

          <Button
            variant="glow"
            className="w-full font-semibold"
            disabled={code.length !== 6 || verifyMutation.isPending}
            onClick={() => code.length === 6 && verifyMutation.mutate(code)}
          >
            {verifyMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              "Verify and enable"
            )}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          <a href="/login" className="text-primary font-medium hover:underline">Back to login</a>
        </p>
      </div>
    </div>
  );
}