import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function EmailVerificationBanner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resendEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/resend-verification");
      return response.json();
    },
    onSuccess: (data: { alreadyVerified?: boolean }) => {
      if (data.alreadyVerified) {
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        toast({
          title: "Already verified",
          description: "Your email is already verified. Refreshing…",
        });
      } else {
        toast({
          title: "Verification Email Sent",
          description: "Please check your email inbox and spam folder.",
        });
      }
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
    <Alert className="mb-6 border-orange-200 bg-orange-50 dark:border-amber-800/70 dark:bg-card dark:shadow-forest">
      <AlertDescription className="flex items-center justify-between w-full gap-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600 dark:text-amber-400" />
          <Mail className="h-4 w-4 shrink-0 text-orange-600 dark:text-amber-400" />
          <span className="text-orange-800 dark:text-foreground">
            <strong>Email verification required.</strong> Please verify your email address to access GitHub and Slack integrations.
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResendEmail}
          disabled={resendEmailMutation.isPending}
          className="shrink-0 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-muted/80"
        >
          {resendEmailMutation.isPending ? "Sending..." : "Resend Email"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
