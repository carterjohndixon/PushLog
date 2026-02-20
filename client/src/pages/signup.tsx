import * as React from "react"
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EyeIcon, EyeOffIcon, Check, X } from "lucide-react";
import { Github } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

interface PasswordRequirement {
  name: string;
  regex: RegExp;
  message: string;
}

const passwordRequirements: PasswordRequirement[] = [
  {
    name: "minLength",
    regex: /.{8,}/,
    message: "At least 8 characters"
  },
  {
    name: "hasUpperCase",
    regex: /[A-Z]/,
    message: "One uppercase letter"
  },
  {
    name: "hasLowerCase",
    regex: /[a-z]/,
    message: "One lowercase letter"
  },
  {
    name: "hasNumber",
    regex: /[0-9]/,
    message: "One number"
  },
  {
    name: "hasSpecialChar",
    regex: /[!@#$%^&*(),.?":{}|<>]/,
    message: "One special character"
  }
];

export default function Signup() {
  const {toast} = useToast();

  const [showPassword, setShowPassword] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordFocused, setPasswordFocused] = React.useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = React.useState(false);
  const [oauthProvider, setOauthProvider] = React.useState<"GitHub" | "Google" | null>(null);

  const passwordStrength = React.useMemo(() => {
    return passwordRequirements.map(req => ({
      ...req,
      isMet: req.regex.test(password)
    }));
  }, [password]);

  const isPasswordValid = passwordStrength.every(req => req.isMet);

  const signupMutation = useMutation({
      mutationFn: async (signupData: any) => {
        const response = await apiRequest("POST", "/api/signup", {
          email,
          username,
          password,
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        return response.json();
      },
      onSuccess: (data: { needsMfaSetup?: boolean; redirectTo?: string }) => {
        toast({
          title: "Account Created",
          description: data?.needsMfaSetup
            ? "Scan the QR code in your authenticator app to finish setup."
            : "Your account has been created successfully.",
        });
        if (data?.needsMfaSetup && data?.redirectTo) {
          window.location.href = data.redirectTo;
        } else {
          window.location.href = "/dashboard";
        }
      },
      onError: (error: any) => {
        toast({
          title: "Signup Failed",
          description: error.message || "Failed to create account.",
          variant: "destructive",
        });
      },
  });

  const handleSignup = (email: string, username: string, password: string) => {
    if (!email || !username || !password) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    if (!isPasswordValid) {
      toast({
        title: "Invalid Password",
        description: "Please meet all password requirements.",
        variant: "destructive",
      });
      return;
    }

    signupMutation.mutate({
      email,
      username,
      password
    });
  };

  // OAuth: GitHub uses server-side init (/api/auth/github/init). Google uses env.
  const isStaging = typeof window !== "undefined" && window.location.hostname === "staging.pushlog.ai";
  const googleClientId = isStaging
    ? (import.meta.env.VITE_STAGE_GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID)
    : (import.meta.env.VITE_PROD_GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const googleRedirectUri = isStaging
    ? (import.meta.env.VITE_STAGE_GOOGLE_REDIRECT_URI || `${window.location.origin}/api/google/user`)
    : (import.meta.env.VITE_PROD_GOOGLE_REDIRECT_URI || import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/api/google/user`);

  const handleGitHubConnect = () => {
    setIsOAuthLoading(true);
    setOauthProvider("GitHub");
    window.location.href = "/api/auth/github/init?returnPath=/dashboard";
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
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-foreground">Start connecting GitHub with Slack</p>
        </div>

        <form className="bg-card border border-border shadow-xl rounded-2xl p-6 sm:p-8 space-y-4">
          <div>
            <Label htmlFor="username" className="text-foreground font-medium">Username</Label>
            <Input 
              onChange={(e) => setUsername(e.target.value)} 
              type="text" 
              id="username" 
              placeholder="johndoe" 
              required 
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
            <Input 
              onChange={(e) => setEmail(e.target.value)} 
              type="email" 
              id="email" 
              placeholder="you@example.com" 
              required 
              className="mt-1.5"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
            <div className="relative mt-1.5">
              <Input 
                onChange={(e) => setPassword(e.target.value)} 
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                type={showPassword ? "text" : "password"} 
                id="password" 
                placeholder="••••••••" 
                required 
                autoComplete="off"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            
            <div className={`space-y-2 text-sm transition-all duration-200 ${passwordFocused || password ? 'opacity-100 max-h-40' : 'opacity-0 max-h-0 overflow-hidden'}`}>
              {passwordStrength.map((requirement) => (
                <div key={requirement.name} className="flex items-center gap-2">
                  {requirement.isMet ? (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={requirement.isMet ? "text-foreground" : "text-muted-foreground"}>
                    {requirement.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <Button 
            onClick={(e) => {
              e.preventDefault(); 
              handleSignup(email, username, password);
            }} 
            variant="glow"
            className="w-full font-semibold mt-2"
          >
            Create Account
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
            Sign up with GitHub
          </Button>
          <Button
            onClick={handleGoogleConnect}
            variant="outline"
            className="w-full h-11 border-2 border-border bg-card text-foreground hover:bg-muted hover:border-muted-foreground/30 font-semibold shadow-sm"
          >
            <svg className="mr-2 w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"/>
            </svg>
            Sign up with Google
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="text-primary font-medium hover:underline">Log in</a>
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