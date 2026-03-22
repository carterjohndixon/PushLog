import * as React from "react";
import { Loader2, ShieldCheck, Lock, Smartphone, RefreshCw, Copy, Download, Check } from "lucide-react";
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
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(null);
  const [savedConfirmed, setSavedConfirmed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

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
    onSuccess: (data: { success: boolean; recoveryCodes?: string[] }) => {
      if (data.recoveryCodes?.length) {
        setRecoveryCodes(data.recoveryCodes);
      }
    },
    onError: (err: Error) => {
      const isSessionExpired =
        err.message.includes("Session expired") || err.message.includes("log in again");
      if (isSessionExpired) {
        toast({
          title: "Session expired",
          description: "Please log in again and complete MFA setup.",
          variant: "destructive",
        });
        setLocation("/login");
      } else {
        toast({
          title: "Invalid code",
          description: err.message || "Please enter the correct 6-digit code from your authenticator app.",
          variant: "destructive",
        });
      }
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mfa/setup/confirm", {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.prefetchQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: fetchProfile });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    },
  });

  const handleCodeChange = (value: string) => {
    setCode(value);
    if (value.length === 6 && !verifyMutation.isPending) {
      verifyMutation.mutate(value);
    }
  };

  const handleCopy = () => {
    if (!recoveryCodes) return;
    navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    if (!recoveryCodes) return;
    const text = "PushLog MFA Recovery Codes\n" + "=".repeat(30) + "\n\n" +
      recoveryCodes.map((c, i) => `${String(i + 1).padStart(2, " ")}. ${c}`).join("\n") +
      "\n\nEach code can only be used once.\nStore these somewhere safe.\n";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pushlog_recovery_codes.txt";
    a.click();
    URL.revokeObjectURL(url);
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

  // Recovery codes step (Step 3)
  if (recoveryCodes) {
    return (
      <AuthLayout backHref="/login" backLabel="Back to login" footer={setupFooter}>
        <div className="mx-auto max-w-2xl w-full space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Save your recovery codes
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              If you lose access to your authenticator app, you can use one of these codes to sign in. Each code can only be used once.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-log-green text-white text-sm font-bold">
                3
              </span>
              <h3 className="text-lg font-semibold text-foreground">Recovery codes</h3>
            </div>

            <div className="rounded-xl border-2 border-border bg-muted/30 p-5">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {recoveryCodes.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border">
                    <span className="text-muted-foreground text-xs w-5 text-right">{i + 1}.</span>
                    <span className="text-foreground tracking-wider">{c}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleCopy}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied" : "Copy all"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>

            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
              <p className="text-sm text-yellow-200 font-medium">Store these codes somewhere safe.</p>
              <p className="text-xs text-muted-foreground mt-1">
                These codes will not be shown again. If you lose your phone and don't have these codes, you'll be locked out of your account.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border bg-background text-log-green focus:ring-log-green/30"
              />
              <span className="text-sm text-foreground">I've saved my recovery codes in a safe place</span>
            </label>

            <Button
              variant="glow"
              className="w-full font-semibold"
              disabled={!savedConfirmed || confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
            >
              {confirmMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing setup…
                </>
              ) : (
                "Complete setup"
              )}
            </Button>
          </div>
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
              Add an extra layer of security to your PushLog account. You'll use an authenticator app to generate codes when you sign in.
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
                  "Verify and continue"
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
