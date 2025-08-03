import * as React from "react"
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function ResetPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const response = await apiRequest("POST", "/api/reset-password", data);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(typeof result === 'string' ? result : 'Failed to reset password');
      }
      return result;
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
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-graphite mb-2">Set new password</h1>
          <p className="text-steel-gray">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-50 shadow-lg rounded-xl p-6 space-y-4">
          <div className="relative">
            <Label htmlFor="password" className="text-graphite">New Password</Label>
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
              className="absolute right-2 top-[70%] transform -translate-y-1/2 text-graphite hover:text-black"
            >
              {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          </div>
          <div className="relative">
            <Label htmlFor="confirmPassword" className="text-graphite">Confirm New Password</Label>
            <Input 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              type={showConfirmPassword ? "text" : "password"} 
              id="confirmPassword" 
              placeholder="••••••••" 
              required 
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(prev => !prev)}
              className="absolute right-2 top-[70%] transform -translate-y-1/2 text-graphite hover:text-black"
            >
              {showConfirmPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          </div>
          <Button 
            type="submit"
            className="w-full bg-log-green text-white font-semibold hover:bg-green-600"
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