import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { PROFILE_QUERY_KEY } from "@/lib/profile";

export default function Join() {
  const [, params] = useRoute("/join/:token");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const token = params?.token ?? "";
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "confirm_leave">("idle");
  const [message, setMessage] = useState("");

  const acceptInvite = (leaveCurrentOrg: boolean) => {
    setStatus("loading");
    setMessage("");
    fetch("/api/org/invites/accept", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, leaveCurrentOrg }),
    })
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
          if (res.ok && data.success) {
            setStatus("success");
            setMessage("You've joined the organization. Redirecting to dashboard...");
            queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
            setTimeout(() => setLocation("/dashboard"), 1500);
          } else {
          setStatus("error");
          setMessage(
            data?.code === "already_in_org"
              ? "You already belong to another organization. You can only be in one organization at a time."
              : data?.error || "Failed to accept invite."
          );
        }
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err?.message || "Something went wrong.");
      });
  };

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid invite link.");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    fetch("/api/profile", { credentials: "include" })
      .then((res) => {
        if (cancelled) return;
        if (res.status === 401) {
          const returnTo = encodeURIComponent(`/join/${token}`);
          setLocation(`/login?redirect=${returnTo}`);
          return;
        }
        return fetch("/api/org/invites/accept", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      })
      .then((res) => {
        if (!res || cancelled) return;
        return res.json().then((data) => {
          if (cancelled) return;
        if (res.ok && data.success) {
          setStatus("success");
          setMessage("You've joined the organization. Redirecting to dashboard...");
          queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
          setTimeout(() => setLocation("/dashboard"), 1500);
        } else if (data?.code === "already_in_org") {
            setStatus("confirm_leave");
            setMessage("You're already in an organization. Do you want to leave it and join this organization? You'll lose access to that organization's repos and integrations.");
          } else {
            setStatus("error");
            setMessage(data?.error || "Failed to accept invite.");
          }
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus("error");
          setMessage(err?.message || "Something went wrong.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Organization invite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin" />
              <p>Accepting invite...</p>
            </div>
          )}
          {status === "success" && (
            <div className="flex flex-col items-center gap-3 text-green-600 dark:text-green-500">
              <CheckCircle className="w-10 h-10" />
              <p>{message}</p>
            </div>
          )}
          {status === "error" && (
            <div className="flex flex-col items-center gap-3 text-destructive">
              <XCircle className="w-10 h-10" />
              <p>{message}</p>
              <Link href="/dashboard">
                <Button variant="outline">Go to dashboard</Button>
              </Link>
            </div>
          )}
          {status === "confirm_leave" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-muted-foreground">{message}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Link href="/dashboard">
                  <Button variant="outline">Cancel</Button>
                </Link>
                <Button
                  variant="default"
                  onClick={() => acceptInvite(true)}
                >
                  Leave and join this organization
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
