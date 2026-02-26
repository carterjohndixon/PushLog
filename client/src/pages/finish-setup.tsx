import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth-layout";
import { useLocation } from "wouter";
import { ShieldCheck } from "lucide-react";

export default function FinishSetup() {
  const [, setLocation] = useLocation();

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
