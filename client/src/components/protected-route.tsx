import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface ProtectedRouteProps {
  children: React.ReactNode;
  pageName?: string;
}

// Token validation function with countdown
function validateTokenWithCountdown() {
  const token = localStorage.getItem('token');
  if (!token) {
    return false;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expirationTime = payload.exp * 1000;
    const currentTime = Date.now();
    const timeRemaining = expirationTime - currentTime;
    
    if (timeRemaining > 0) {
      // If token will expire in the next 5 minutes, redirect
      if (timeRemaining <= 300000) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return false;
      }
      return true;
    } else {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return false;
    }
  } catch (error) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    return false;
  }
}

export function ProtectedRoute({ children, pageName }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if there's a token in the URL hash (OAuth callback)
    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      const token = hash.substring(7);
      localStorage.setItem('token', token);
      
      // Extract userId from the token and store it
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.userId) {
          localStorage.setItem('userId', payload.userId.toString());
        }
      } catch (error) {
        console.error('Failed to extract userId from token:', error);
      }
      
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

    // Verify token is valid and get user profile
    apiRequest("GET", "/api/profile")
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setIsAuthenticated(true);
          setUserProfile(data.user || data); // Store the profile data
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

  // Add token validation with countdown (runs every 2 seconds)
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      validateTokenWithCountdown();
    }, 2 * 1000);

    // Run validation immediately
    validateTokenWithCountdown();

    return () => {
      clearInterval(interval);
    };
  }, [isAuthenticated]);

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