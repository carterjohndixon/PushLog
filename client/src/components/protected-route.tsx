import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PROFILE_QUERY_KEY, fetchProfile, ProfileError, type ProfileResponse } from "@/lib/profile";

interface ProtectedRouteProps {
  children: React.ReactNode;
  pageName?: string;
}

export function ProtectedRoute({ children, pageName }: ProtectedRouteProps) {
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  // After GitHub connect/reconnect (redirect with ?github_connected=1), invalidate repo queries once and clean URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("github_connected") === "1") {
      params.delete("github_connected");
      const newSearch = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
      queryClient.invalidateQueries({ queryKey: ["/api/repositories-and-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/repositories"] });
    }
  }, [queryClient]);

  const { data: profileResponse, isPending, isError, error } = useQuery<ProfileResponse>({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    retry: (failureCount, err) => {
      if (err instanceof ProfileError && err.status === 401) return false;
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => 1000 * (attemptIndex + 1),
  });

  const isAuthenticated = !!profileResponse?.success && !!profileResponse?.user;
  const userProfile = profileResponse?.user ?? null;

  // In-flow loader: keeps persistent header visible (no full-screen overlay).
  if (isPending) {
    return (
      <div className="min-h-[50vh] px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-4 border-log-green border-t-transparent rounded-full animate-spin shrink-0"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">Loading {pageName}…</p>
        </div>
      </div>
    );
  }

  // On session/cookie or Cloudflare Access expiry, redirect to login with a full page load
  // so the user doesn't have to refresh; full load also lets CF re-auth if needed (staging).
  if (isError && error instanceof ProfileError) {
    const target = error.redirectTo || "/login";
    window.location.href = target;
    return null;
  }

  // Require account-type onboarding step when profile says so (new signups)
  if (isAuthenticated && userProfile?.needsAccountTypeStep === true && location !== "/onboarding/account-type") {
    setLocation("/onboarding/account-type");
    return null;
  }

  return isAuthenticated ? (
    <>
      {React.cloneElement(children as React.ReactElement, { userProfile })}
    </>
  ) : null;
}
