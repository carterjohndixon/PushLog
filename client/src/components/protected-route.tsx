import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface ProtectedRouteProps {
  children: React.ReactNode;
  pageName?: string;
}

export function ProtectedRoute({ children, pageName }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 2;

    const checkAuth = async () => {
      try {
        const response = await fetch("/api/profile", {
          credentials: "include",
          headers: { "Accept": "application/json" }
        });

        if (!isMounted) return;

        if (response.ok) {
          const data = await response.json();
          if (data.success || data.id) {
            setIsAuthenticated(true);
            setUserProfile(data.user || data);
            setLoading(false);
            return;
          }
        }

        // If 401, session is invalid - redirect to login
        if (response.status === 401) {
          if (isMounted) {
            setLocation('/login');
            setLoading(false);
          }
          return;
        }

        // For other errors (network, 500, etc.), retry a few times
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Auth check failed, retrying... (${retryCount}/${maxRetries})`);
          setTimeout(checkAuth, 1000 * retryCount); // Exponential backoff
          return;
        }

        // Max retries reached - if it's a network error, don't redirect
        // Only redirect if it's an auth error
        if (response.status === 401 && isMounted) {
          setLocation('/login');
        }
        setLoading(false);
      } catch (error) {
        if (!isMounted) return;
        
        // Network error - retry a few times before giving up
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Network error, retrying... (${retryCount}/${maxRetries})`);
          setTimeout(checkAuth, 1000 * retryCount);
          return;
        }

        // Max retries reached - assume network issue, don't redirect
        // User can still use the app if they're already authenticated
        console.error("Auth check failed after retries:", error);
        setLoading(false);
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [setLocation]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full mx-4 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="w-8 h-8 border-4 border-log-green border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-graphite mb-2">
                Loading {pageName}...
              </h3>
              <p className="text-sm text-steel-gray">
                Please wait while we load your data.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return isAuthenticated ? (
    <>
      {React.cloneElement(children as React.ReactElement, { userProfile })}
    </>
  ) : null;
} 