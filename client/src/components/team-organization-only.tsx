import { Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";

/**
 * Solo accounts use PushLog without org/team UI; `/organization` is only for team mode.
 * Nav links already hide this route for solo — this blocks direct URL / in-app navigation.
 */
export function TeamOrganizationOnly({ children }: { children: React.ReactNode }) {
  const { data: profileResponse, isFetched, isLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    retry: false,
  });

  if (!isFetched || isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (profileResponse?.user?.accountType === "solo") {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}
