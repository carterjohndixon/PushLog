import * as React from "react"
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [, setLocation] = useLocation();

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/forgot-password", {
        email,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Reset Link Sent",
        description: "If an account exists with this email, you will receive a password reset link.",
      });
      // Redirect to login after short delay
      setTimeout(() => setLocation("/login"), 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Request Failed",
        description: error.message || "Failed to send reset link. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: "Missing Email",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }
    forgotPasswordMutation.mutate(email);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-graphite mb-2">Reset your password</h1>
          <p className="text-steel-gray">Enter your email to receive a password reset link</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-50 shadow-lg rounded-xl p-6 space-y-4">
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
          <Button 
            type="submit"
            className="w-full bg-log-green text-white font-semibold hover:bg-green-600"
            disabled={forgotPasswordMutation.isPending}
          >
            {forgotPasswordMutation.isPending ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>

        <p className="text-center text-sm text-steel-gray">
          Remember your password? <a href="/login" className="text-log-green hover:underline">Log in</a>
        </p>
      </div>
    </div>
  );
} 