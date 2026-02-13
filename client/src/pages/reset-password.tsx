import * as React from "react"
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EyeIcon, EyeOffIcon, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";

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

export default function ResetPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordFocused, setPasswordFocused] = React.useState(false);

  const passwordStrength = React.useMemo(() => {
    return passwordRequirements.map(req => ({
      ...req,
      isMet: req.regex.test(password)
    }));
  }, [password]);

  const isPasswordValid = passwordStrength.every(req => req.isMet);
  const doPasswordsMatch = password === confirmPassword && password !== "";

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      try {
        const response = await apiRequest("POST", "/api/reset-password", data);
        return await response.json();
      } catch (error) {
        // The apiRequest function throws an error with the raw text response
        // We need to parse it to get the clean error message
        const errorMessage = error instanceof Error ? error.message : 'Failed to reset password';
        
        // If the error message is wrapped in quotes, remove them
        const cleanMessage = errorMessage.replace(/^"(.*)"$/, '$1');
        
        throw new Error(cleanMessage);
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Password Reset Successful",
        description: "Your password has been reset. You can now log in with your new password.",
      });
      // Redirect to login after short delay
      setTimeout(() => setLocation("/login"), 2000);
    },
    onError: (error: Error) => {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password || !confirmPassword) {
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

    if (password !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }

    // Get token from URL
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");

    if (!token) {
      toast({
        title: "Invalid Reset Link",
        description: "The password reset link is invalid or has expired.",
        variant: "destructive",
      });
      return;
    }

    resetPasswordMutation.mutate({ token, password });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-graphite mb-2">Set new password</h1>
          <p className="text-steel-gray">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-50 shadow-lg rounded-xl p-6 space-y-4">
          <div className="mb-6 space-y-2">
            <Label htmlFor="password" className="text-graphite">New Password</Label>
            <div className="relative">
              <Input 
                onChange={(e) => setPassword(e.target.value)} 
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                type={showPassword ? "text" : "password"} 
                id="password" 
                placeholder="••••••••" 
                required 
                autoComplete="off"
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

          <div className="mb-6 space-y-2">
            <Label htmlFor="confirmPassword" className="text-graphite">Confirm New Password</Label>
            <div className="relative">
              <Input 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                type={showPassword ? "text" : "password"}
                id="confirmPassword" 
                placeholder="••••••••" 
                required 
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-graphite hover:text-black"
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
            
            {/* Password match indicator */}
            {confirmPassword && (
              <div className="flex items-center space-x-2 text-sm">
                {doPasswordsMatch ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-red-500" />
                )}
                <span className={doPasswordsMatch ? "text-green-700" : "text-red-700"}>
                  {doPasswordsMatch ? "Passwords match" : "Passwords don't match"}
                </span>
              </div>
            )}
          </div>
          <Button 
            variant="glow"
            type="submit"
            className="w-full font-semibold"
            disabled={resetPasswordMutation.isPending}
          >
            {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
          </Button>
        </form>

        <p className="text-center text-sm text-steel-gray">
          Remember your password? <a href="/login" className="text-log-green hover:underline">Log in</a>
        </p>
      </div>
    </div>
  );
} 