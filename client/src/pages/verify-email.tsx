import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { AuthLayout } from "@/components/auth-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const calledRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(`/api/verify-email?token=${encodeURIComponent(token)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Verification failed");
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Verification failed");
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Email verified",
        description: "Your email has been verified. Redirecting to dashboard…",
      });
      queryClient.clear();
      queryClient.invalidateQueries();
      setTimeout(() => setLocation("/dashboard"), 1200);
    },
    onError: (error: Error) => {
      toast({
        title: "Verification failed",
        description: error.message || "Could not verify your email.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");

    if (!token) {
      toast({
        title: "Verification failed",
        description: "Verification link is invalid or missing.",
        variant: "destructive",
      });
      return;
    }

    mutation.mutate(token);
  }, []);

  const verifying = mutation.isPending || mutation.isIdle;
  const success = mutation.isSuccess;
  const error = mutation.isError;

  return (
    <AuthLayout backHref="/login" backLabel="Back to login">
      <div className="mx-auto w-full max-w-md flex flex-col items-center justify-center min-h-[50vh]">
        <Card className="w-full border border-border bg-card/95 backdrop-blur-sm shadow-xl">
          <CardHeader className="text-center pb-2">
            <h1 className="text-xl font-semibold text-foreground">
              {verifying && "Verifying your email"}
              {success && "Email verified"}
              {error && "Verification failed"}
            </h1>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pb-6">
            {verifying && (
              <>
                <Loader2 className="w-12 h-12 animate-spin text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground text-center">
                  Please wait while we verify your email address.
                </p>
              </>
            )}
            {success && (
              <>
                <CheckCircle className="w-12 h-12 text-primary" aria-hidden />
                <p className="text-sm text-muted-foreground text-center">
                  You’ll be redirected to the dashboard shortly.
                </p>
              </>
            )}
            {error && (
              <>
                <XCircle className="w-12 h-12 text-destructive" aria-hidden />
                <p className="text-sm text-muted-foreground text-center">
                  The link may be expired or already used. Request a new verification email from
                  Settings or try logging in again.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="mt-2">
                    Back to login
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}
