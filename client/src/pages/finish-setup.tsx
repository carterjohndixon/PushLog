import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth-layout";
import { useLocation } from "wouter";
import { ShieldCheck, User, Users, Loader2 } from "lucide-react";

type Step = "role" | "security";

export default function FinishSetup() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("role");
  const [savingRole, setSavingRole] = useState(false);

  const setOrgType = (type: "solo" | "team") => {
    setSavingRole(true);
    fetch("/api/org", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ type }),
    })
      .then(() => setStep("security"))
      .catch(() => setStep("security"))
      .finally(() => setSavingRole(false));
  };

  if (step === "role") {
    return (
      <AuthLayout backHref="/dashboard" backLabel="Dashboard">
        <div className="mx-auto w-full max-w-lg space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">
              How are you using PushLog?
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose the option that best fits. You can change this later in settings.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setOrgType("solo")}
              disabled={savingRole}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-border bg-card p-6 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Solo developer</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  It’s just me. I’ll connect my repos and get notifications.
                </p>
              </div>
              {savingRole ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setOrgType("team")}
              disabled={savingRole}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-border bg-card p-6 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Team / organization</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  I’ll invite teammates and we’ll manage repos together.
                </p>
              </div>
              {savingRole ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : null}
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout backHref="/dashboard" backLabel="Dashboard">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">
            Finish your setup
          </h1>
          <p className="text-sm text-muted-foreground">
            Your account is ready. Add two-factor authentication to secure your account, then head to the dashboard.
          </p>
        </div>

        <div className="bg-card border border-border shadow-xl rounded-2xl p-6 sm:p-8 space-y-4">
          <Button
            variant="glow"
            className="w-full font-semibold"
            onClick={() => setLocation("/setup-mfa")}
          >
            Continue to security setup
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => setLocation("/dashboard")}
          >
            Skip for now
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
