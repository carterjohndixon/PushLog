import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if there's a token in the URL hash (OAuth callback)
    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      const token = hash.substring(7);
      localStorage.setItem('token', token);
      // Clean up the URL
      window.history.replaceState(null, '', window.location.pathname);
      setIsAuthenticated(true);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setLocation('/login');
      return;
    }

    // Verify token is valid
    apiRequest("GET", "/api/profile")
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('token');
          setLocation('/login');
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        setLocation('/login');
      })
      .finally(() => {
        setLoading(false);
      });
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
                Loading Dashboard...
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

  return isAuthenticated ? <>{children}</> : null;
} 