import * as React from "react"
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Github } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

export default function Login() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [showPassword, setShowPassword] = React.useState(false);
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isOAuthLoading, setIsOAuthLoading] = React.useState(false);
  const [oauthProvider, setOauthProvider] = React.useState<"GitHub" | "Google" | null>(null);

  // Check if user is already authenticated - redirect to dashboard if so
  React.useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/profile", {
          credentials: "include",
          headers: { "Accept": "application/json" }
        });
        
        if (response.ok) {
          // User is already authenticated, redirect to dashboard
          window.location.href = "/dashboard";
        }
      } catch (error) {
        // Not authenticated or network error - stay on login page
      }
    };
    
    checkAuth();
  }, []);

  // Check for error messages from OAuth redirects
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    
    if (error) {
      toast({
        title: "Authentication Failed",
        description: decodeURIComponent(error),
        variant: "destructive",
      });
      // Clean up the URL without reloading
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [toast]);

  const loginMutation = useMutation({
      mutationFn: async (loginData: any) => {
        const response = await apiRequest("POST", "/api/login", {
          identifier, // Either email or username
          password,
        });

        return response.json();
      },
      onSuccess: async () => {
        await queryClient.prefetchQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: fetchProfile });
        setLocation("/dashboard");
      },
      onError: (error: any) => {
        toast({
          title: "Login Failed",
          description: error.message || "Failed to Login.",
          variant: "destructive",
        });
      },
  });

  const handleLogin = (identifier: string, password: string) => {
    if (!identifier || !password) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    loginMutation.mutate({
      identifier,
      password
    });
  };

  // OAuth: client IDs from env (staging vs prod app); redirect URIs always from current origin so we never send wrong domain.
  const isStaging = typeof window !== "undefined" && window.location.hostname === "staging.pushlog.ai";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const githubClientId = isStaging
    ? (import.meta.env.VITE_STAGE_GITHUB_CLIENT_ID || "Ov23liXZqMTCvDM4tDHv")
    : (import.meta.env.VITE_PROD_GITHUB_CLIENT_ID || "Ov23li5UgB18JcaZHnxk");
  const githubRedirectUri = origin ? `${origin}/api/auth/user` : "";
  const googleClientId = isStaging
    ? (import.meta.env.VITE_STAGE_GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID)
    : (import.meta.env.VITE_PROD_GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const googleRedirectUri = origin ? `${origin}/api/google/user` : "";

  const handleGitHubConnect = () => {
    setIsOAuthLoading(true);
    setOauthProvider("GitHub");
    const clientId = githubClientId;
    const redirectUri = `${window.location.origin}/api/auth/user`;
    const scope = "repo user:email admin:org_hook";
    const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem("github_oauth_state", state);
    setTimeout(() => {
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
    }, 500);
  };

  const handleGoogleConnect = () => {
    if (!googleClientId || !googleRedirectUri) return;
    setIsOAuthLoading(true);
    setOauthProvider("Google");
    const scope = "email profile";
    setTimeout(() => {
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${encodeURIComponent(googleRedirectUri)}&response_type=code&scope=${scope}`;
    }, 500);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">Log in to PushLog</h1>
          <p className="text-sm text-muted-foreground">Seamlessly connect GitHub with Slack</p>
        </div>

        <form className="bg-card border border-border shadow-xl rounded-2xl p-6 sm:p-8 space-y-4">
          <div>
            <Label htmlFor="identifier" className="text-foreground font-medium">Email or Username</Label>
            <Input 
              onChange={(e) => setIdentifier(e.target.value)} 
              type="text" 
              id="identifier" 
              placeholder="you@example.com or username" 
              required 
              className="mt-1.5"
            />
          </div>
          <div className="relative">
            <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
            <Input 
              onChange={(e) => setPassword(e.target.value)} 
              type={showPassword ? "text" : "password"} 
              id="password" 
              placeholder="••••••••" 
              required 
              autoComplete="off"
              className="mt-1.5 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(prev => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
            <div className="mt-2 text-right">
              <a href="/forgot-password" className="text-sm text-primary hover:underline font-medium">
                Forgot password?
              </a>
            </div>
          </div>
          <Button 
            variant="glow"
            onClick={(e) => {
              e.preventDefault(); 
              handleLogin(identifier, password);
            }} 
            className="w-full font-semibold mt-2"
          >
            Log In
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <span className="flex-1 border-t border-border" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">or</span>
          <span className="flex-1 border-t border-border" />
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleGitHubConnect}
            variant="outline"
            className="w-full h-11 border-2 border-border bg-card text-foreground hover:bg-muted hover:border-muted-foreground/30 font-semibold shadow-sm"
          >
            <Github className="mr-2 w-4 h-4 shrink-0" />
            Log in with GitHub
          </Button>
          <Button
            onClick={handleGoogleConnect}
            variant="outline"
            className="w-full h-11 border-2 border-border bg-card text-foreground hover:bg-muted hover:border-muted-foreground/30 font-semibold shadow-sm"
          >
            <svg className="mr-2 w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"/>
            </svg>
            Log in with Google
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="text-primary font-medium hover:underline">Sign up</a>
        </p>
      </div>
      
      <LoadingOverlay 
        isVisible={isOAuthLoading} 
        provider={oauthProvider}
        message="Redirecting you to authenticate with your account..."
      />
    </div>
  );
}
