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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">Reset your password</h1>
          <p className="text-sm text-muted-foreground">Enter your email to receive a password reset link</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border shadow-xl rounded-2xl p-6 sm:p-8 space-y-4">
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
          <Button 
            variant="glow"
            type="submit"
            className="w-full font-semibold"
            disabled={forgotPasswordMutation.isPending}
          >
            {forgotPasswordMutation.isPending ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <a href="/login" className="text-primary font-medium hover:underline">Log in</a>
        </p>
      </div>
    </div>
  );
} 