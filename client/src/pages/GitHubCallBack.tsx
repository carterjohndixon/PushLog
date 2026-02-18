import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

/**
 * GitHub OAuth callback page.
 * User lands here after authorizing on GitHub (redirect_uri = /auth/github/callback).
 * We use a form POST (not fetch) so the server's 302 + Set-Cookie is a full-page navigation
 * response — browsers reliably process Set-Cookie from navigation, unlike fetch responses.
 * This also avoids CDN/proxy caching the API (which caused users to see raw JSON).
 */
export default function GitHubCallback() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);
  const [returnPath] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("returnPath") || "" : ""
  );

  useEffect(() => {
    if (submittedRef.current) return;

    const query = new URLSearchParams(window.location.search);
    const code = query.get("code");
    const state = query.get("state");
    const error = query.get("error");
    const storedState = localStorage.getItem("github_oauth_state");

    localStorage.removeItem("github_oauth_state");
    localStorage.removeItem("returnPath");

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

    submittedRef.current = true;
    formRef.current?.submit();
  }, []);

  const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const code = query?.get("code") ?? "";
  const state = query?.get("state") ?? "";

  return (
    <div className="flex h-screen justify-center items-center">
      <form
        ref={formRef}
        method="POST"
        action="/api/auth/github/exchange"
        className="hidden"
      >
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="redirectUri" value={`${typeof window !== "undefined" ? window.location.origin : ""}/auth/github/callback`} />
        {returnPath && <input type="hidden" name="returnPath" value={returnPath} />}
      </form>
      <p className="text-lg">Connecting to GitHub...</p>
    </div>
  );
}
