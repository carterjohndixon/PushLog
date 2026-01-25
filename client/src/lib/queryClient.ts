import { QueryClient, QueryFunction } from "@tanstack/react-query";

function handleAuthenticationFailure() {
  // Clear any cached data (React Query cache)
  // No localStorage cleanup needed - we don't store tokens there
  
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    
    // Handle 401 Unauthorized globally, but only for authenticated routes
    if (res.status === 401) {
      // Check if this is a login/signup request - don't redirect for these
      const url = res.url;
      if (url.includes('/api/login') || url.includes('/api/signup')) {
        throw new Error(text || 'Invalid credentials');
      }
      
      // Check if we're on the home page - don't redirect (home page is public)
      if (typeof window !== 'undefined' && window.location.pathname === '/') {
        throw new Error('Not authenticated'); // Just throw, don't redirect
      }
      
      // For other authenticated routes, handle session expiration
      handleAuthenticationFailure();
      throw new Error('Session expired');
    }
    
    throw new Error(text || res.statusText);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    // Always include Accept header for JSON
    "Accept": "application/json"
  };
  
  // Add Content-Type header if there's data
  if (data) {
    headers["Content-Type"] = "application/json";
  }

  // NO Authorization header needed!
  // Browser automatically sends HTTP-only cookie via credentials: "include"

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include", // ✅ Sends HTTP-only cookie automatically
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // NO headers needed - cookie is sent automatically via credentials: "include"
    const res = await fetch(queryKey[0] as string, {
      credentials: "include", // ✅ Sends HTTP-only cookie automatically
      headers: {
        "Accept": "application/json"
      }
    });

    // Handle 401 Unauthorized globally (session expired/invalid)
    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      handleAuthenticationFailure();
      throw new Error('Session expired');
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes instead of Infinity
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
