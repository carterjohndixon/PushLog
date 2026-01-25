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
    /**
     * Check authentication by calling /api/profile
     * 
     * WHY THIS APPROACH:
     * - /api/profile requires authentication (uses authenticateToken middleware)
     * - If session is valid → returns user data
     * - If session is invalid → returns 401 → redirect to login
     * - No token checking needed - server handles everything
     */
    apiRequest("GET", "/api/profile")
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setIsAuthenticated(true);
          setUserProfile(data.user || data); // Store the profile data
        } else {
          // Session invalid or expired
          setLocation('/login');
        }
      })
      .catch(() => {
        // Request failed (401, network error, etc.) - redirect to login
        setLocation('/login');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [setLocation]);

  // NO token validation interval needed!
  // Server handles session expiration automatically
  // If session expires, next API call will return 401 → redirect to login

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