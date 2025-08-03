import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Logo } from "@/components/logo";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const token = searchParams.get("token");

        if (!token) {
          throw new Error("Verification token is missing");
        }

        const response = await apiRequest("GET", `/api/verify-email?token=${token}`);
        const data = await response.json();

        if (data.success) {
          // Store the new token with updated emailVerified status
          localStorage.setItem("token", data.token);
          
          toast({
            title: "Email Verified",
            description: "Your email has been successfully verified.",
          });

          // Redirect to dashboard after short delay
          setTimeout(() => setLocation("/dashboard"), 2000);
        } else {
          throw new Error(data.error || "Verification failed");
        }
      } catch (error: any) {
        toast({
          title: "Verification Failed",
          description: error.message || "Failed to verify email address.",
          variant: "destructive",
        });
        // Redirect to login after error
        setTimeout(() => setLocation("/login"), 2000);
      } finally {
        setVerifying(false);
      }
    };

    verifyEmail();
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <Logo size="lg" className="mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-graphite mb-2">
          {verifying ? "Verifying your email..." : "Email verification complete!"}
        </h1>
        <p className="text-steel-gray">
          {verifying 
            ? "Please wait while we verify your email address."
            : "You'll be redirected to the dashboard shortly."}
        </p>
      </div>
    </div>
  );
} 