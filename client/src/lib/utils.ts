import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function handleTokenExpiration(error: any, queryClient?: any) {
  // Check if the error indicates token expiration
  const isTokenExpired = 
    error?.message?.includes('expired') ||
    error?.message?.includes('unauthorized') ||
    error?.message?.includes('Authentication required') ||
    error?.status === 401 ||
    error?.statusCode === 401;

  if (isTokenExpired) {
    // Clear the token from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    
    // Invalidate all queries to clear cached data
    if (queryClient) {
      queryClient.clear();
    }
    
    // Redirect to login page
    window.location.href = '/login';
    
    return true; // Indicates token was expired
  }
  
  return false; // Token was not expired
}
