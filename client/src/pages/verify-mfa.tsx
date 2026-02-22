import * as React from "react";
import { ArrowLeft, Loader2, Smartphone } from "lucide-react";
import { Logo } from "@/components/logo";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";

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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <a
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Back to login
        </a>
        <div className="text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">
            Enter verification code
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app to sign in to PushLog
          </p>
        </div>

        <div className="bg-card border border-border shadow-xl rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
            <Smartphone className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">Check your authenticator app</span>
          </div>
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
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Verifying…</span>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Use a different account?{" "}
          <a href="/login" className="text-primary font-medium hover:underline">Sign in with email or GitHub</a>
        </p>
      </div>
    </div>
  );
}
