import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PROFILE_QUERY_KEY, fetchProfile, ProfileError, type ProfileResponse } from "@/lib/profile";

interface ProtectedRouteProps {
  children: React.ReactNode;
  pageName?: string;
}

export function ProtectedRoute({ children, pageName }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

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

  const { data: profileResponse, isLoading, isError, error, isFetched } = useQuery<ProfileResponse>({
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

  if (isFetched && !isLoading && !isAuthenticated) {
    if (error instanceof ProfileError && error.status === 401) {
      setLocation("/login");
      return null;
    }
  }

  if (isLoading || !isFetched || (!isAuthenticated && !isError)) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-card border border-border rounded-xl shadow-lg p-8 max-w-sm w-full mx-4 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="w-8 h-8 border-4 border-log-green border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Loading {pageName}...
              </h3>
              <p className="text-sm text-muted-foreground">
                Please wait while we load your data.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError && error instanceof ProfileError && error.status === 401) {
    setLocation("/login");
    return null;
  }

  return isAuthenticated ? (
    <>
      {React.cloneElement(children as React.ReactElement, { userProfile })}
    </>
  ) : null;
}
