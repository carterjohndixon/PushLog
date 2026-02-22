import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Github } from "lucide-react";

/**
 * GitHub OAuth callback page.
 * User lands here after authorizing on GitHub (redirect_uri = /auth/github/callback).
 * Renders the login page layout with an overlay so it doesn't feel like a blank intermediate page.
 * We use a form POST (not fetch) so the server's 302 + Set-Cookie is a full-page navigation
 * response — browsers reliably process Set-Cookie from navigation, unlike fetch responses.
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

    if (!state) {
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">Log in to PushLog</h1>
          <p className="text-sm text-muted-foreground">Seamlessly connect GitHub with Slack</p>
        </div>

        <div className="bg-card border border-border shadow-xl rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex-1 border-t border-border" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">or</span>
            <span className="flex-1 border-t border-border" />
          </div>
          <div className="space-y-3">
            <Button
              variant="outline"
              disabled
              className="w-full h-11 border-2 border-border bg-card text-foreground font-semibold shadow-sm opacity-90"
            >
              <Github className="mr-2 w-4 h-4 shrink-0" />
              Log in with GitHub
            </Button>
            <Button
              variant="outline"
              disabled
              className="w-full h-11 border-2 border-border bg-card text-foreground font-semibold shadow-sm opacity-70"
            >
              <svg className="mr-2 w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"/>
              </svg>
              Log in with Google
            </Button>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="text-primary font-medium hover:underline">Sign up</a>
        </p>
      </div>

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

      <LoadingOverlay
        isVisible={true}
        provider="GitHub"
        message="Completing sign in with GitHub..."
      />
    </div>
  );
}
