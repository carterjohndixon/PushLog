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
      onSuccess: (data) => {
        // Store the token
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
        toast({
          title: "Account Created",
          description: "Your account has been created successfully.",
        });
        window.location.href = "/dashboard";
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

  const handleGitHubConnect = () => {
    setIsOAuthLoading(true);
    setOauthProvider("GitHub");
    
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || "Iv23lixttif7N6Na9P9b";
    const redirectUri = "https://7e6d-32-141-233-130.ngrok-free.app/api/auth/user";
    const scope = "repo user:email admin:org_hook";
    
    // Generate and store state for CSRF protection
    const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    localStorage.setItem('github_oauth_state', state);
    
    // Add a small delay to show the loading state
    setTimeout(() => {
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    }, 500);
  };

  const handleGoogleConnect = () => {
    setIsOAuthLoading(true);
    setOauthProvider("Google");
    
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI || "https://7e6d-32-141-233-130.ngrok-free.app/api/google/user";
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
          <h1 className="text-3xl font-bold text-graphite mb-2">Create your account</h1>
          <p className="text-steel-gray">Start connecting GitHub with Slack</p>
        </div>

        <form className="bg-gray-50 shadow-lg rounded-xl p-6 space-y-4">
          <div>
            <Label htmlFor="username" className="text-graphite">Username</Label>
            <Input 
              onChange={(e) => setUsername(e.target.value)} 
              type="text" 
              id="username" 
              placeholder="johndoe" 
              required 
            />
          </div>
          <div>
            <Label htmlFor="email" className="text-graphite">Email</Label>
            <Input 
              onChange={(e) => setEmail(e.target.value)} 
              type="email" 
              id="email" 
              placeholder="you@example.com" 
              required 
            />
          </div>
          <div className="mb-6 space-y-2">
            <Label htmlFor="password" className="text-graphite">Password</Label>
            <div className="relative">
              <Input 
                onChange={(e) => setPassword(e.target.value)} 
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                type={showPassword ? "text" : "password"} 
                id="password" 
                placeholder="••••••••" 
                required 
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-graphite hover:text-black"
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
            
            {/* Password requirements list */}
            <div className={`space-y-2 text-sm transition-all duration-200 ${passwordFocused || password ? 'opacity-100 max-h-40' : 'opacity-0 max-h-0 overflow-hidden'}`}>
              {passwordStrength.map((requirement) => (
                <div key={requirement.name} className="flex items-center space-x-2">
                  {requirement.isMet ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 text-red-500" />
                  )}
                  <span className={requirement.isMet ? "text-green-700" : "text-red-700"}>
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
            className="w-full bg-log-green text-white font-semibold hover:bg-green-600"
          >
            Create Account
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
          Sign up with GitHub
        </Button>

        <Button
          onClick={handleGoogleConnect}
          variant="outline"
          className="w-full bg-gray-100 text-graphite hover:bg-gray-200 font-semibold"
        >
          <svg className="mr-2 w-4 h-4" viewBox="0 0 24 24">
            <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"/>
          </svg>
          Sign up with Google
        </Button>

        <p className="text-center text-sm text-steel-gray">
          Already have an account? <a href="/login" className="text-log-green hover:underline">Log in</a>
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