import { QueryClient, QueryFunction } from "@tanstack/react-query";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/auth/github/callback",
  "/setup-mfa",
  "/verify-mfa",
];

function handleAuthenticationFailure() {
  // Clear any cached data (React Query cache)
  // No localStorage cleanup needed - we don't store tokens there
  
  // Only redirect if we're on an authenticated route (not public pages)
  // ProtectedRoute component handles route-level redirects, so we only handle API-level 401s
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    
    // Don't redirect if already on public pages
    if (!PUBLIC_PATHS.includes(currentPath)) {
      // Only redirect if not already being handled by ProtectedRoute
      // ProtectedRoute will handle the redirect, so we can be less aggressive here
      // But for API calls that fail with 401, we should still redirect
      window.location.href = '/login'; 
    }
  }
}

/** Use a short, safe message for toasts; never show raw HTML or huge bodies. */
function sanitizeErrorMessage(body: string, status: number, statusText: string): string {
  const trimmed = body?.trim() ?? '';
  if (!trimmed) return statusText || 'Request failed';
  if (trimmed.startsWith('<!') || trimmed.toLowerCase().includes('<!doctype') || trimmed.toLowerCase().includes('<html')) {
    return status >= 500 ? 'Server error. Please try again.' : 'Request failed. Please try again.';
  }
  try {
    const json = JSON.parse(trimmed);
    const msg = json?.message ?? json?.error ?? json?.details;
    if (typeof msg === 'string' && msg.length < 300) return msg;
  } catch {
    // not JSON
  }
  if (trimmed.length > 200) return status >= 500 ? 'Server error. Please try again.' : 'Request failed. Please try again.';
  return trimmed;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    const message = sanitizeErrorMessage(text, res.status, res.statusText);

    // Handle 403 with MFA required - redirect to setup or verify
    if (res.status === 403) {
      try {
        const json = JSON.parse(text);
        if (json.redirectTo && (json.needsMfaSetup || json.needsMfaVerify)) {
          if (typeof window !== "undefined") {
            const currentPath = window.location.pathname;
            const targetPath = new URL(json.redirectTo, window.location.origin).pathname;
            const isPublicOrAuthPage = currentPath === "/" || currentPath === "/login" || currentPath === "/signup";
            // Don't redirect if already on target MFA page, or if user is on home/login/signup (they chose to be there).
            if (currentPath !== targetPath && !isPublicOrAuthPage) {
              window.location.href = json.redirectTo;
            }
          }
          throw new Error("MFA required");
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          // Not JSON, fall through to generic throw
        } else {
          throw e;
        }
      }
    }

    // Handle 401 Unauthorized
    if (res.status === 401) {
      const url = res.url;
      if (url.includes('/api/login') || url.includes('/api/signup')) {
        throw new Error(message || 'Invalid credentials');
      }

      // On public pages (e.g. verify-mfa, setup-mfa), don't redirect; throw with server message so UI can show "session expired" vs "invalid code"
      if (typeof window !== 'undefined' && PUBLIC_PATHS.includes(window.location.pathname)) {
        throw new Error(message || 'Not authenticated');
      }

      // Other authenticated routes: redirect to login
      handleAuthenticationFailure();
      throw new Error(message || 'Session expired');
    }

    throw new Error(message);
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
      staleTime: 10 * 60 * 1000, // 10 min - fewer refetches
      gcTime: 30 * 60 * 1000, // 30 min - keep cache for back/forward navigation
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
