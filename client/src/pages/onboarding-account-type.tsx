import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth-layout";
import { useLocation } from "wouter";
import { User, Users } from "lucide-react";
import { PROFILE_QUERY_KEY } from "@/lib/profile";

export default function OnboardingAccountType() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState<"solo" | "team" | null>(null);

  const submit = async (type: "solo" | "team") => {
    setSubmitting(type);
    try {
      const res = await fetch("/api/onboarding/account-type", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to set account type");
      await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      setLocation("/dashboard");
    } catch (e) {
      setSubmitting(null);
      console.error(e);
    }
  };

  return (
    <AuthLayout backHref="/dashboard" backLabel="Dashboard">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">
            How will you use PushLog?
          </h1>
          <p className="text-sm text-muted-foreground">
            You can change this later in Settings.
          </p>
        </div>

        <div className="grid gap-3">
          <Button
            variant="outline"
            className="h-auto py-4 px-4 flex items-center gap-3 text-left"
            onClick={() => submit("solo")}
            disabled={submitting !== null}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold block">Solo</span>
              <span className="text-sm text-muted-foreground">Just me — personal projects and logs.</span>
            </div>
            {submitting === "solo" && (
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </Button>
          <Button
            variant="outline"
            className="h-auto py-4 px-4 flex items-center gap-3 text-left"
            onClick={() => submit("team")}
            disabled={submitting !== null}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold block">Organization</span>
              <span className="text-sm text-muted-foreground">Team — invite members and manage together.</span>
            </div>
            {submitting === "team" && (
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
