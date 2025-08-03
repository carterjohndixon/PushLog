import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function GitHubCallback() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const handleCallback = async () => {
      const query = new URLSearchParams(window.location.search);
      const code = query.get("code");
      const state = query.get("state");
      const storedState = localStorage.getItem('github_oauth_state');

      // Clean up the stored state
      localStorage.removeItem('github_oauth_state');

      if (!code) {
        console.error("No authorization code received");
        toast({
          title: "Authentication Failed",
          description: "No authorization code received. Please try again.",
          variant: "destructive",
        });
        setLocation('/login');
        return;
      }

      if (!state || !storedState || state !== storedState) {
        console.error("Invalid state parameter");
        toast({
          title: "Authentication Failed",
          description: "Invalid state parameter. Please try again.",
          variant: "destructive",
        });
        setLocation('/login');
        return;
      }

      try {
        // Make request with proper headers
        const response = await fetch(`/api/auth/user?code=${code}`, {
          headers: {
            'Accept': 'application/json'
          }
        });

        // Parse response as JSON
        const data = await response.json();
        
        if (data.success && data.token) {
          localStorage.setItem('token', data.token);
          if (data.user && data.user.id) {
            localStorage.setItem('userId', data.user.id.toString());
          }
          
          // Invalidate queries to refetch data with new token
          queryClient.invalidateQueries();
          
          toast({
            title: "GitHub Connected",
            description: "Your GitHub account has been successfully connected.",
          });
          
          setLocation('/dashboard');
        } else {
          throw new Error(data.error || "Authentication failed");
        }
      } catch (error: any) {
        console.error("GitHub authentication error:", error);
        toast({
          title: "Connection Failed",
          description: error.message || "Failed to connect GitHub account. Please try again.",
          variant: "destructive",
        });
        setLocation('/login');
      }
    };

    handleCallback();
  }, [setLocation, queryClient, toast]);

  return (
    <div className="flex h-screen justify-center items-center">
      <p className="text-lg">Connecting to GitHub...</p>
    </div>
  );
}
