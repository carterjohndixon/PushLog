import * as React from "react";
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
    staleTime: Infinity, // One-time setup; don't refetch (avoids refetch-fail loop when session/cookie is flaky)
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
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-log-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading MFA setup…</p>
        </div>
      </div>
    );
  }

  if (!data?.qrDataUrl) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">Unable to load MFA setup</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {setupError instanceof Error ? setupError.message : "Please log in and try again."}
          </p>
          <Button variant="outline" onClick={() => setLocation("/login")}>
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Set up two-factor authentication</h1>
          <p className="text-sm text-muted-foreground">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
        </div>

        <div className="bg-card border border-border shadow-xl rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex justify-center">
            <img src={data.qrDataUrl} alt="MFA QR code" className="rounded-lg border border-border" width={200} height={200} />
          </div>

          <div className="space-y-3">
            <p className="text-sm text-center text-foreground font-medium">Then enter the 6-digit code from your app</p>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={handleCodeChange}
              >
                <InputOTPGroup className="gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} className="h-12 w-12 rounded-lg border-2" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <Button
            variant="glow"
            className="w-full"
            disabled={code.length !== 6 || verifyMutation.isPending}
            onClick={() => code.length === 6 && verifyMutation.mutate(code)}
          >
            {verifyMutation.isPending ? "Verifying…" : "Verify and continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}