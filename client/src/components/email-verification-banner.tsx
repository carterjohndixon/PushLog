import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

export function EmailVerificationBanner() {
  const { toast } = useToast();

  const resendEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/resend-verification");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Verification Email Sent",
        description: "Please check your email inbox and spam folder.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send Email",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleResendEmail = () => {
    resendEmailMutation.mutate();
  };

  return (
    <Alert className="mb-6 border-orange-200 bg-orange-50">
      <AlertDescription className="flex items-center justify-between w-full">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <Mail className="h-4 w-4 text-orange-600" />
          <span className="text-orange-800">
            <strong>Email verification required.</strong> Please verify your email address to access GitHub and Slack integrations.
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResendEmail}
            disabled={resendEmailMutation.isPending}
            className="border-orange-300 text-orange-700 hover:bg-orange-100"
          >
            {resendEmailMutation.isPending ? "Sending..." : "Resend Email"}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
