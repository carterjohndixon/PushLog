import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Global function to handle token expiration
function handleTokenExpiration() {
  console.log('Token expired, redirecting to login');
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  
  // Clear any cached data
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Handle 401 Unauthorized globally
    if (res.status === 401) {
      handleTokenExpiration();
      throw new Error('Token expired');
    }
    
    const text = await res.text();
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

  // Add Authorization header if token exists
  const token = localStorage.getItem('token');
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
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
    const headers: Record<string, string> = {};
    
    // Add Authorization header if token exists
    const token = localStorage.getItem('token');
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      headers
    });

    // Handle 401 Unauthorized globally
    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      handleTokenExpiration();
      throw new Error('Token expired');
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
