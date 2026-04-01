import { Switch, Route, Redirect, useLocation } from "wouter";
import { isPayingUiEnabled } from "@/lib/payingUi";
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
import { TeamOrganizationOnly } from "@/components/team-organization-only";
import { ErrorBoundary } from "@/components/error-boundary";
import { Header } from "@/components/header";


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
const Pricing = lazy(() => import("@/pages/pricing"));
const Terms = lazy(() => import("@/pages/terms"));
const SubProcessors = lazy(() => import("@/pages/sub-processors"));
const Settings = lazy(() => import("@/pages/settings"));
const Admin = lazy(() => import("@/pages/admin"));
const AdminPricing = lazy(() => import("@/pages/admin-pricing"));
const Support = lazy(() => import("@/pages/support"));
const GitHubCallback = lazy(() => import("@/pages/GitHubCallBack"));
const SetupMfa = lazy(() => import("@/pages/setup-mfa"));
const VerifyMfa = lazy(() => import("@/pages/verify-mfa"));
const FinishSetup = lazy(() => import("@/pages/finish-setup"));
const OnboardingAccountType = lazy(() => import("@/pages/onboarding-account-type"));
const Join = lazy(() => import("@/pages/join"));
const Organization = lazy(() => import("@/pages/organization"));
const ChangePassword = lazy(() => import("@/pages/change-password"));
const Billing = lazy(() => import("@/pages/billing"));

/** Shown under the persistent header while a lazy route chunk loads (keeps header visible). */
const RouteChunkFallback = () => (
  <div className="min-h-[50vh] px-4 sm:px-6 lg:px-8 py-6">
    <div className="max-w-6xl mx-auto space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="h-4 w-full max-w-xl rounded bg-muted/70" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-4">
        <div className="h-32 rounded-lg bg-muted/50 border border-border" />
        <div className="h-32 rounded-lg bg-muted/50 border border-border" />
        <div className="h-32 rounded-lg bg-muted/50 border border-border hidden lg:block" />
      </div>
    </div>
  </div>
);

const PERSISTENT_HEADER_PATHS_BASE = ["/dashboard", "/integrations", "/repositories", "/search", "/analytics", "/models", "/settings", "/organization", "/billing"] as const;

function Router() {
  const [location] = useLocation();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const isStagingHost = host === "staging.pushlog.ai" || host === "localhost" || host === "127.0.0.1";
  const payingUi = isPayingUiEnabled();
  const persistentHeaderPaths: readonly string[] = payingUi
    ? PERSISTENT_HEADER_PATHS_BASE
    : PERSISTENT_HEADER_PATHS_BASE.filter((p) => p !== "/billing");
  const showPersistentHeader =
    persistentHeaderPaths.includes(location) ||
    (location === "/admin" && isStagingHost) ||
    (location === "/admin/pricing" && isStagingHost);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location]);

  return (
    <>
      {showPersistentHeader && <Header />}
      <Suspense fallback={<RouteChunkFallback />}>
      <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/auth/github/callback" component={GitHubCallback} />
      <Route path="/setup-mfa" component={SetupMfa} />
      <Route path="/verify-mfa" component={VerifyMfa} />
      <Route path="/finish-setup">
        <ProtectedRoute pageName="finish-setup">
          <FinishSetup />
        </ProtectedRoute>
      </Route>
      <Route path="/onboarding/account-type">
        <ProtectedRoute pageName="account-type">
          <OnboardingAccountType />
        </ProtectedRoute>
      </Route>
      <Route path="/join/:token" component={Join} />

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
      <Route path="/pricing" component={Pricing} />
      <Route path="/terms" component={Terms} />
      <Route path="/sub-processors" component={SubProcessors} />
      <Route path="/support" component={Support} />
      <Route path="/settings">
        <ProtectedRoute pageName="settings">
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/organization">
        <ProtectedRoute pageName="organization">
          <TeamOrganizationOnly>
            <Organization />
          </TeamOrganizationOnly>
        </ProtectedRoute>
      </Route>
      <Route path="/change-password">
        <ProtectedRoute pageName="change-password">
          <ChangePassword />
        </ProtectedRoute>
      </Route>
      <Route path="/billing">
        {payingUi ? (
          <ProtectedRoute pageName="billing">
            <Billing />
          </ProtectedRoute>
        ) : (
          <Redirect to="/dashboard" />
        )}
      </Route>
      {isStagingHost && (
        <Route path="/admin">
          <ProtectedRoute pageName="admin">
            <Admin />
          </ProtectedRoute>
        </Route>
      )}
      {isStagingHost && (
        <Route path="/admin/pricing">
          <ProtectedRoute pageName="admin">
            <AdminPricing />
          </ProtectedRoute>
        </Route>
      )}
      
      <Route path="*">
        <Redirect to="/" />
      </Route>
    </Switch>
      </Suspense>
    </>
  );
}

export default function App() {
  useChunkErrorHandler();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <NotificationSSE />
        <Toaster />
        <IncidentToast />
        <NotificationDetailsModal />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
