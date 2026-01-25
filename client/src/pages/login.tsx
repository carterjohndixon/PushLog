import * as React from "react"
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Github } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

export default function Login() {
  const {toast} = useToast();

  const [showPassword, setShowPassword] = React.useState(false);
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isOAuthLoading, setIsOAuthLoading] = React.useState(false);
  const [oauthProvider, setOauthProvider] = React.useState<"GitHub" | "Google" | null>(null);

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
      onSuccess: (data) => {
        window.location.href = `${window.location.origin}/dashboard`;
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

  // Set up OAuth with GitHub and Google.
  const handleGitHubConnect = () => {
    setIsOAuthLoading(true);
    setOauthProvider("GitHub");
    
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || "Ov23li5UgB18JcaZHnxk";
    const redirectUri = import.meta.env.VITE_GITHUB_REDIRECT_URI || "https://pushlog.ai/api/auth/user"
    const scope = "repo user:email admin:org_hook";
    
    // Log what we're using (for debugging)
    console.log("Frontend GitHub OAuth - Client ID:", clientId.substring(0, 10) + "...");
    console.log("Frontend GitHub OAuth - Redirect URI:", redirectUri);
    
    const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    localStorage.setItem('github_oauth_state', state);
    
    setTimeout(() => {
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    }, 500);
  };

  const handleGoogleConnect = () => {
    setIsOAuthLoading(true);
    setOauthProvider("Google");
    
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI
    const scope = "email profile";
    
    // Add a small delay to show the loading state
    setTimeout(() => {
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    }, 500);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-graphite mb-2">Log in to PushLog</h1>
          <p className="text-steel-gray">Seamlessly connect GitHub with Slack</p>
        </div>

        <form className="bg-gray-50 shadow-lg rounded-xl p-6 space-y-4">
          <div>
            <Label htmlFor="identifier" className="text-graphite">Email or Username</Label>
            <Input 
              onChange={(e) => setIdentifier(e.target.value)} 
              type="text" 
              id="identifier" 
              placeholder="you@example.com or username" 
              required 
            />
          </div>
          <div className="mb-6 relative">
            <Label htmlFor="password" className="text-graphite">Password</Label>
            <Input 
              onChange={(e) => setPassword(e.target.value)} 
              type={showPassword ? "text" : "password"} 
              id="password" 
              placeholder="••••••••" 
              required 
            />
            <button
              type="button"
              onClick={() => setShowPassword(prev => !prev)}
              className="absolute right-2 top-[45%] transform -translate-y-1/2 text-graphite hover:text-black"
            >
              {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
            </button>
            <div className="mt-2 text-right">
              <a href="/forgot-password" className="text-sm text-log-green hover:underline">
                Forgot password?
              </a>
            </div>
          </div>
          <Button 
            onClick={(e) => {
              e.preventDefault(); 
              handleLogin(identifier, password);
            }} 
            className="w-full bg-log-green text-white font-semibold hover:bg-green-600"
          >
            Log In
          </Button>
        </form>

        <div className="flex items-center justify-center">
          <span className="text-sm text-steel-gray">or</span>
        </div>

        <Button
          onClick={handleGitHubConnect}
          variant="outline"
          className="w-full bg-gray-100 text-graphite hover:bg-gray-200 font-semibold"
        >
          <Github className="mr-2 w-4 h-4" />
          Log in with GitHub
        </Button>

        <Button
          onClick={handleGoogleConnect}
          variant="outline"
          className="w-full bg-gray-100 text-graphite hover:bg-gray-200 font-semibold"
        >
          <svg className="mr-2 w-4 h-4" viewBox="0 0 24 24">
            <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"/>
          </svg>
          Log in with Google
        </Button>

        <p className="text-center text-sm text-steel-gray">
          Don't have an account? <a href="/signup" className="text-log-green hover:underline">Sign up</a>
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
