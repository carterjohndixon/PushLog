import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

/**
 * GitHub OAuth callback page.
 * User lands here after authorizing on GitHub (redirect_uri = /auth/github/callback).
 * We POST the code to the API instead of using GET — avoids CDN/proxy caching the API response
 * which can cause users to see raw JSON instead of being redirected.
 */
export default function GitHubCallback() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const calledRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async ({ code, state }: { code: string; state: string | null }) => {
      const redirectUri = `${window.location.origin}/auth/github/callback`;
      const response = await fetch("/api/auth/github/exchange", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code, state, redirectUri }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Authentication failed");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({
        title: "GitHub Connected",
        description: "Your GitHub account has been successfully connected.",
      });
      const returnPath = localStorage.getItem("returnPath");
      localStorage.removeItem("returnPath");
      const target = returnPath && returnPath.startsWith("/") ? returnPath : "/dashboard";
      window.location.href = target; // Full page nav so browser sends session cookie (client-side setLocation can run before cookie is committed)
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
    const error = query.get("error");
    const storedState = localStorage.getItem("github_oauth_state");

    localStorage.removeItem("github_oauth_state");

    if (error) {
      toast({
        title: "GitHub Authorization Failed",
        description: query.get("error_description") || error,
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }

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

    mutation.mutate({ code, state });
  }, []);

  return (
    <div className="flex h-screen justify-center items-center">
      <p className="text-lg">Connecting to GitHub...</p>
    </div>
  );
}
