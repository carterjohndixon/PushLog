import { Switch, Route, Redirect, useLocation } from "wouter";
import { Suspense, lazy, useEffect } from "react";

const CHUNK_RELOAD_KEY = "pushlog_chunk_error_reload";

function useChunkErrorHandler() {
  useEffect(() => {
    const handle = (e: ErrorEvent) => {
      const msg = e.message || "";
      if (
        msg.includes("Failed to fetch dynamically imported module") ||
        msg.includes("Loading chunk") ||
        msg.includes("Loading CSS chunk")
      ) {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          window.location.reload();
        }
      }
    };
    window.addEventListener("error", handle);
    return () => window.removeEventListener("error", handle);
  }, []);

  useEffect(() => {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  }, []);
}
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { IncidentToast } from "@/components/incident-toast";
import { NotificationSSE } from "@/components/notification-sse";
import { NotificationDetailsModal } from "@/components/notification-details-modal";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/protected-route";
import { ErrorBoundary } from "@/components/error-boundary";

const Header = lazy(() => import("@/components/header").then((m) => ({ default: m.Header })));


// Lazy load pages for better performance
const Home = lazy(() => import("@/pages/home"));
const Login = lazy(() => import("@/pages/login"));
const Signup = lazy(() => import("@/pages/signup"));
const VerifyEmail = lazy(() => import("@/pages/verify-email"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Integrations = lazy(() => import("@/pages/integrations"));
const Repositories = lazy(() => import("@/pages/repositories"));
const Search = lazy(() => import("@/pages/search"));
const Analytics = lazy(() => import("@/pages/analytics"));
const Models = lazy(() => import("@/pages/models"));
const Policy = lazy(() => import("@/pages/policy"));
const Terms = lazy(() => import("@/pages/terms"));
const SubProcessors = lazy(() => import("@/pages/sub-processors"));
const Settings = lazy(() => import("@/pages/settings"));
const Admin = lazy(() => import("@/pages/admin"));
const Support = lazy(() => import("@/pages/support"));

// Loading component for lazy-loaded pages
const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="bg-card border border-border rounded-xl shadow-lg p-8 max-w-sm w-full mx-4 text-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <div className="w-8 h-8 text-log-green animate-spin rounded-full border-4 border-border border-t-log-green"></div>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Loading...</h3>
          <p className="text-sm text-muted-foreground">Please wait while we load the page.</p>
        </div>
      </div>
    </div>
  </div>
);

const PERSISTENT_HEADER_PATHS = ["/dashboard", "/integrations", "/repositories", "/search", "/analytics", "/models", "/settings"];

function Router() {
  const [location] = useLocation();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const isStagingHost = host === "staging.pushlog.ai" || host === "localhost" || host === "127.0.0.1";
  const showPersistentHeader = PERSISTENT_HEADER_PATHS.includes(location) || (location === "/admin" && isStagingHost);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location]);

  return (
    <>
      {showPersistentHeader && (
        <Suspense fallback={<header className="h-16 shrink-0 border-b border-border bg-background" aria-hidden />}>
          <Header />
        </Suspense>
      )}
      <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      
      <Route path="/dashboard">
        <ProtectedRoute pageName="dashboard">
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/integrations">
        <ProtectedRoute pageName="integrations">
          <Integrations />
        </ProtectedRoute>
      </Route>
      <Route path="/repositories">
        <ProtectedRoute pageName="repositories">
          <Repositories />
        </ProtectedRoute>
      </Route>
      <Route path="/search">
        <ProtectedRoute pageName="search">
          <Search />
        </ProtectedRoute>
      </Route>
      <Route path="/analytics">
        <ProtectedRoute pageName="analytics">
          <Analytics />
        </ProtectedRoute>
      </Route>
      <Route path="/models">
        <ProtectedRoute pageName="models">
          <ErrorBoundary>
            <Models />
          </ErrorBoundary>
        </ProtectedRoute>
      </Route>
      
      <Route path="/policy" component={Policy} />
      <Route path="/terms" component={Terms} />
      <Route path="/sub-processors" component={SubProcessors} />
      <Route path="/support" component={Support} />
      <Route path="/settings">
        <ProtectedRoute pageName="settings">
          <Settings />
        </ProtectedRoute>
      </Route>
      {isStagingHost && (
        <Route path="/admin">
          <ProtectedRoute pageName="admin">
            <Admin />
          </ProtectedRoute>
        </Route>
      )}
      
      <Route path="*">
        <Redirect to="/" />
      </Route>
    </Switch>
    </>
  );
}

export default function App() {
  useChunkErrorHandler();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Suspense fallback={<PageLoader />}>
          <Router />
          <NotificationSSE />
          <Toaster />
          <IncidentToast />
          <NotificationDetailsModal />
        </Suspense>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
