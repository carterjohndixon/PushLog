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
          headers: { "Accept": "application/json" },
          // Add timeout to prevent hanging requests
          signal: AbortSignal.timeout(10000) // 10 second timeout
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

        // ONLY redirect on explicit 401 (session expired/invalid)
        // Don't redirect on network errors, timeouts, or other status codes
        if (response.status === 401) {
          console.log('Session expired (401), redirecting to login');
          if (isMounted) {
            setLocation('/login');
            setLoading(false);
          }
          return;
        }

        // For other HTTP errors (500, 503, etc.), retry a few times
        if (retryCount < maxRetries && response.status >= 500) {
          retryCount++;
          console.log(`Server error (${response.status}), retrying... (${retryCount}/${maxRetries})`);
          setTimeout(checkAuth, 1000 * retryCount);
          return;
        }

        // For non-401 errors after retries, assume temporary issue
        // Don't redirect - user might still have valid session
        if (response.status !== 401) {
          console.warn(`Auth check returned ${response.status}, but not redirecting (not 401)`);
          // If we previously authenticated, keep them authenticated
          if (isAuthenticated) {
            setLoading(false);
            return;
          }
        }
        
        setLoading(false);
      } catch (error: any) {
        if (!isMounted) return;
        
        // Handle AbortError (timeout) - don't redirect, just retry
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`Request timeout, retrying... (${retryCount}/${maxRetries})`);
            setTimeout(checkAuth, 1000 * retryCount);
            return;
          }
          // Timeout after retries - don't redirect, assume network issue
          console.warn('Auth check timed out after retries, keeping user authenticated if previously authenticated');
          if (isAuthenticated) {
            setLoading(false);
            return;
          }
        }
        
        // Network error - retry a few times before giving up
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Network error, retrying... (${retryCount}/${maxRetries})`);
          setTimeout(checkAuth, 1000 * retryCount);
          return;
        }

        // Max retries reached - assume network issue, DON'T redirect
        // Only redirect if we're certain the session is expired (401)
        // For network errors, keep user authenticated if they were previously authenticated
        console.warn("Auth check failed after retries (network error), not redirecting:", error);
        if (isAuthenticated) {
          // Keep them authenticated - it's likely just a network issue
          setLoading(false);
        } else {
          // First time check failed - show loading error but don't redirect
          // They might have a valid session, just network issues
          setLoading(false);
        }
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [setLocation, isAuthenticated]);

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