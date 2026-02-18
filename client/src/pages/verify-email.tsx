import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Logo } from "@/components/logo";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const calledRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(`/api/verify-email?token=${token}`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Verification failed");
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Verification failed");
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Email Verified",
        description: "Your email has been successfully verified.",
      });
      setTimeout(() => {
        queryClient.clear();
        queryClient.invalidateQueries();
        setLocation("/dashboard");
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Failed to verify email address.",
        variant: "destructive",
      });
      setTimeout(() => setLocation("/login"), 2000);
    },
  });

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");

    if (!token) {
      toast({
        title: "Verification Failed",
        description: "Verification token is missing",
        variant: "destructive",
      });
      setTimeout(() => setLocation("/login"), 2000);
      return;
    }

    mutation.mutate(token);
  }, []);

  const verifying = mutation.isPending || mutation.isIdle;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <Logo size="lg" className="mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-graphite mb-2">
          {verifying ? "Verifying your email..." : "Email verification complete!"}
        </h1>
        <p className="text-steel-gray">
          {verifying
            ? "Please wait while we verify your email address."
            : "You'll be redirected to the dashboard shortly."}
        </p>
      </div>
    </div>
  );
}
