import { Switch, Route } from "wouter";
import { Suspense, lazy } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/protected-route";


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
const NotFound = lazy(() => import("@/pages/not-found"));

// Loading component for lazy-loaded pages
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full mx-4 text-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <div className="w-8 h-8 text-log-green animate-spin rounded-full border-4 border-gray-200 border-t-log-green"></div>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-graphite mb-2">Loading...</h3>
          <p className="text-sm text-steel-gray">Please wait while we load the page.</p>
        </div>
      </div>
    </div>
  </div>
);

function Router() {
  return (
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
      
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Suspense fallback={<PageLoader />}>
          <Router />
          <Toaster />
        </Suspense>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
