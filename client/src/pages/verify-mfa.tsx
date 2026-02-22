import * as React from "react";
import { Loader2, Smartphone, ShieldCheck } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { AuthLayout } from "@/components/auth-layout";

const verifyFooter = (
  <>
    <a href="/" className="font-medium text-foreground hover:text-primary transition-colors">PushLog</a>
    <span className="mx-2">·</span>
    <span>Verification</span>
  </>
);

export default function VerifyMfa() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [code, setCode] = React.useState("");

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/mfa/verify", { code });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.prefetchQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: fetchProfile });
      toast({ title: "Login successful", description: "Welcome back." });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({
        title: "Invalid code",
        description: err.message || "Please enter the correct 6-digit code from your authenticator app.",
        variant: "destructive",
      });
      setCode("");
    },
  });

  const handleCodeChange = (value: string) => {
    setCode(value);
    if (value.length === 6 && !verifyMutation.isPending) {
      verifyMutation.mutate(value);
    }
  };

  return (
    <AuthLayout backHref="/login" backLabel="Back to login" footer={verifyFooter}>
      <div className="mx-auto w-full max-w-lg space-y-8">
          {/* Hero */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Enter your verification code
            </h1>
            <p className="text-muted-foreground">
              We need to confirm it’s you. Open your authenticator app and enter the 6-digit code.
            </p>
          </div>

          {/* Main card */}
          <div className="rounded-2xl border border-border bg-card shadow-xl p-6 sm:p-10 space-y-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="rounded-full bg-primary/10 p-4">
                <Smartphone className="w-10 h-10 text-log-green" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Check your authenticator app</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the code that’s currently showing. It updates every 30 seconds.
                </p>
              </div>
            </div>

            <div className="space-y-4">
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
              {verifyMutation.isPending && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying…</span>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-log-green shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-0.5">Don’t have your phone?</p>
                <p>Use a different account to sign in, or recover access from your account settings after you’re in.</p>
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Use a different account?{" "}
            <a href="/login" className="text-primary font-medium hover:underline">Sign in with email or GitHub</a>
          </p>
      </div>
    </AuthLayout>
  );
}
