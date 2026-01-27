import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function handleTokenExpiration(error: any, queryClient?: any) {
  // DEPRECATED: This function is kept for backward compatibility but no longer redirects.
  // Redirects are now handled by:
  // 1. ProtectedRoute component (for route-level auth checks)
  // 2. queryClient.ts handleAuthenticationFailure (for API-level 401 errors)
  // 
  // This function now only clears localStorage (for old JWT tokens) and invalidates queries.
  // It does NOT redirect to prevent duplicate redirects and redirect loops.
  
  const isTokenExpired = 
    error?.message?.includes('expired') ||
    error?.message?.includes('unauthorized') ||
    error?.message?.includes('Authentication required') ||
    error?.status === 401 ||
    error?.statusCode === 401;

  if (isTokenExpired) {
    // Clear old JWT tokens from localStorage (if any exist from before session migration)
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    
    // Invalidate all queries to clear cached data
    if (queryClient) {
      queryClient.clear();
    }
    
    // DO NOT redirect here - let ProtectedRoute or queryClient handle it
    // Redirecting here causes duplicate redirects and can create redirect loops
    
    return true; // Indicates token was expired
  }
  
  return false; // Token was not expired
}
