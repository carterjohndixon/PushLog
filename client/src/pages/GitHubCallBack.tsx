import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function GitHubCallback() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const calledRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await fetch(`/api/auth/user?code=${code}`, {
        headers: { "Accept": "application/json" },
      });
      if (response.redirected || response.status === 302 || response.status === 301) {
        return { success: true };
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Authentication failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({
        title: "GitHub Connected",
        description: "Your GitHub account has been successfully connected.",
      });
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      console.error("GitHub authentication error:", error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect GitHub account. Please try again.",
        variant: "destructive",
      });
      setLocation("/login");
    },
  });

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const query = new URLSearchParams(window.location.search);
    const code = query.get("code");
    const state = query.get("state");
    const storedState = localStorage.getItem("github_oauth_state");

    localStorage.removeItem("github_oauth_state");

    if (!code) {
      toast({
        title: "Authentication Failed",
        description: "No authorization code received. Please try again.",
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }

    if (!state || !storedState || state !== storedState) {
      toast({
        title: "Authentication Failed",
        description: "Invalid state parameter. Please try again.",
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }

    mutation.mutate(code);
  }, []);

  return (
    <div className="flex h-screen justify-center items-center">
      <p className="text-lg">Connecting to GitHub...</p>
    </div>
  );
}
