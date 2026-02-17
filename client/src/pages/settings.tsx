import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { formatLocalDate } from "@/lib/date";
import { 
  Download, 
  Trash2, 
  Shield, 
  Database, 
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Github,
  CreditCard,
  KeyRound,
  EyeIcon,
  EyeOffIcon,
  Code2
} from "lucide-react";
import { SiSlack, SiGoogle } from "react-icons/si";
import { Link, useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

interface DataSummary {
  accountCreated: string;
  email: string;
  emailVerified: boolean;
  connectedServices: {
    github: boolean;
    google: boolean;
    slack: boolean;
  };
  dataSummary: {
    repositories: number;
    integrations: number;
    slackWorkspaces: number;
    pushEvents: number;
    notifications: number;
    aiUsageRecords: number;
    payments: number;
  };
  aiCredits: number;
}

export default function Settings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [githubDisconnectModalOpen, setGithubDisconnectModalOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: profileResponse } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
  });
  const devMode = profileResponse?.user?.devMode ?? false;

  const updateDevModeMutation = useMutation({
    mutationFn: async (checked: boolean) => {
      const res = await fetch("/api/user", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ devMode: checked }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: (_, checked) => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      toast({
        title: checked ? "Developer mode enabled" : "Developer mode disabled",
        description: checked ? "Incident test features are now visible below." : "Test features are now hidden.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  // Fetch account data summary (uses session cookie via credentials: include)
  const { data: dataSummary, isLoading } = useQuery<DataSummary>({
    queryKey: ["/api/account/data-summary"],
    queryFn: async () => {
      const response = await fetch('/api/account/data-summary', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to fetch data summary');
      return response.json();
    }
  });

  // GitHub connect/reconnect: get OAuth URL and redirect
  const [isGithubConnectLoading, setIsGithubConnectLoading] = useState(false);
  const handleGitHubConnect = async () => {
    setIsGithubConnectLoading(true);
    try {
      const response = await fetch("/api/github/connect", { credentials: "include", headers: { Accept: "application/json" } });
      const data = await response.json();
      if (response.status === 401) {
        setLocation("/login");
        return;
      }
      if (!response.ok) {
        if (response.status === 400 && data.error === "GitHub account already connected") {
          toast({
            title: "Already connected",
            description: "GitHub is already connected. If you're having issues, disconnect and reconnect.",
            variant: "default",
          });
        } else {
          toast({ title: "Connection failed", description: data.error || "Failed to connect GitHub.", variant: "destructive" });
        }
        return;
      }
      if (data.url) {
        if (data.state) localStorage.setItem("github_oauth_state", data.state);
        localStorage.setItem("returnPath", "/settings");
        window.location.href = data.url;
      }
    } catch (e) {
      toast({ title: "Connection failed", description: "Could not start GitHub connection.", variant: "destructive" });
    } finally {
      setIsGithubConnectLoading(false);
    }
  };

  const githubDisconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/github/disconnect", { method: "POST", credentials: "include", headers: { Accept: "application/json" } });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error(d.error || "Failed to disconnect");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account/data-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/repositories-and-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/repositories"] });
      setGithubDisconnectModalOpen(false);
      toast({ title: "GitHub disconnected", description: "You can reconnect anytime from this page." });
    },
    onError: (error: Error) => {
      toast({ title: "Disconnect failed", description: error.message, variant: "destructive" });
    },
  });

  // Export data mutation (uses session cookie via credentials: include)
  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/account/export', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) throw new Error('Failed to export data');
      
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pushlog-data-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Data Exported",
        description: "Your data has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export your data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Delete account mutation (uses session cookie via credentials: include)
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ confirmDelete: deleteConfirmation })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete account');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account Deleted",
        description: "Your account and all data have been permanently deleted.",
      });
      setLocation('/');
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error("New passwords do not match");
      }
      const res = await apiRequest("POST", "/api/change-password", {
        currentPassword,
        newPassword,
      });
      return res;
    },
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "Your password has been updated. Other sessions have been signed out.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: any) => {
      toast({
        title: "Change password failed",
        description: error?.message ?? "Please check your current password and try again.",
        variant: "destructive",
      });
    },
  });

  const simulateSentryAlertMutation = useMutation({
    mutationFn: async (fullPipeline: boolean) => {
      const res = await apiRequest("POST", "/api/test/simulate-incident", {
        fullPipeline,
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/all"] });
      toast({ title: "Incident sent", description: "Check your notifications (bell icon)." });
    },
    onError: (error: Error) => {
      toast({ title: "Simulate failed", description: error.message, variant: "destructive" });
    },
  })


  const sentTestBrowserNotificationMutation = useMutation({
    mutationFn: async () => {
      new Notification("PushLog test", {
        body: "If you see this, browser notifications are working. You'll get these when incidents occur.",
        icon: "/images/PushLog-06p_njbF.png",
        tag: "pushlog-test",
      });
      toast({ title: "Test notification sent", description: "Check your OS notification area (or system tray)." });
    },
    onSuccess: () => {
      toast({ title: "Test notification sent", description: "Check your OS notification area (or system tray)." });
    },
    onError: (error: Error) => {
      toast({ title: "Could not send test notification", variant: "destructive", description: error.message });
    },
  });

  return (
    <div className="min-h-screen flex flex-col bg-forest-gradient">
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-graphite mb-2">Account Settings</h1>
          <p className="text-steel-gray">Manage your account, data, and privacy preferences</p>
        </div>

        <div className="space-y-6">
          {/* Account Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-log-green" />
                Account Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <p className="text-steel-gray">Loading account data...</p>
              ) : dataSummary ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-steel-gray">Email</p>
                      <p className="font-medium flex items-center gap-2">
                        {dataSummary.email}
                        {dataSummary.emailVerified ? (
                          <Badge variant="outline" className="text-log-green border-log-green">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                            Unverified
                          </Badge>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-steel-gray">Account Created</p>
                      <p className="font-medium">
                        {formatLocalDate(dataSummary.accountCreated)}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm text-steel-gray mb-2">Connected Services</p>
                    <div className="flex gap-2">
                      <Badge variant={dataSummary.connectedServices.github ? "default" : "secondary"}>
                        <Github className="w-3 h-3 mr-1" />
                        GitHub {dataSummary.connectedServices.github ? "✓" : ""}
                      </Badge>
                      <Badge variant={dataSummary.connectedServices.google ? "default" : "secondary"}>
                        <SiGoogle className="w-3 h-3 mr-1" />
                        Google {dataSummary.connectedServices.google ? "✓" : ""}
                      </Badge>
                      <Badge variant={dataSummary.connectedServices.slack ? "default" : "secondary"}>
                        <SiSlack className="w-3 h-3 mr-1" />
                        Slack {dataSummary.connectedServices.slack ? "✓" : ""}
                      </Badge>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm text-steel-gray mb-2">AI Credits</p>
                    <p className="font-medium flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      {dataSummary.aiCredits.toLocaleString()} credits remaining
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-steel-gray">Unable to load account data</p>
              )}
            </CardContent>
          </Card>

          {/* GitHub connection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="w-5 h-5" />
                GitHub
              </CardTitle>
              <CardDescription>
                Connect or reconnect your GitHub account to list repositories and connect them to PushLog. Disconnecting will hide all repositories until you reconnect.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dataSummary && (
                <>
                  <div className="flex items-center gap-2">
                    <Badge variant={dataSummary.connectedServices.github ? "default" : "secondary"}>
                      {dataSummary.connectedServices.github ? "Connected" : "Not connected"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="glow"
                      className="text-white"
                      disabled={isGithubConnectLoading}
                      onClick={handleGitHubConnect}
                    >
                      <Github className="w-4 h-4 mr-2" />
                      {dataSummary.connectedServices.github ? (isGithubConnectLoading ? "Redirecting…" : "Reconnect GitHub") : (isGithubConnectLoading ? "Connecting…" : "Connect GitHub")}
                    </Button>
                    {dataSummary.connectedServices.github && (
                      <Button
                        variant="outline"
                        className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                        onClick={() => setGithubDisconnectModalOpen(true)}
                        disabled={githubDisconnectMutation.isPending}
                      >
                        Disconnect GitHub
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Your Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-sky-blue" />
                Your Data
              </CardTitle>
              <CardDescription>
                Overview of all data stored in your PushLog account
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dataSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-graphite">{dataSummary.dataSummary.repositories}</p>
                    <p className="text-sm text-steel-gray">Repositories</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-graphite">{dataSummary.dataSummary.integrations}</p>
                    <p className="text-sm text-steel-gray">Integrations</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-graphite">{dataSummary.dataSummary.pushEvents}</p>
                    <p className="text-sm text-steel-gray">Push Events</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-graphite">{dataSummary.dataSummary.slackWorkspaces}</p>
                    <p className="text-sm text-steel-gray">Slack Workspaces</p>
                  </div>
                </div>
              )}

              <div className="mt-6 pt-4 border-t">
                <Button 
                  onClick={handleExportData} 
                  disabled={isExporting}
                  variant="glow"
                  className="text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isExporting ? "Exporting..." : "Export My Data"}
                </Button>
                <p className="text-xs text-steel-gray mt-2">
                  Download a copy of all your data in JSON format. This includes repositories, integrations, push events, and more.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Privacy */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-log-green" />
                Privacy & Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-steel-gray mb-2">
                  Learn about how we handle your data and your privacy rights.
                </p>
                <Link href="/policy">
                  <Button variant="outline">
                    View Privacy Policy
                  </Button>
                </Link>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-semibold text-graphite mb-2">Security Measures</h3>
                <ul className="space-y-2 text-sm text-steel-gray">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-log-green" />
                    Passwords are hashed using bcrypt
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-log-green" />
                    OAuth tokens are encrypted at rest
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-log-green" />
                    All data transmitted over HTTPS
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-log-green" />
                    Database encrypted at rest (Supabase)
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Change password (logged in) */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <KeyRound className="w-5 h-5 text-log-green dark:text-emerald-400" />
                Change password
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter your current password and choose a new one. Other devices will be signed out.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password" className="text-foreground">Current password</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="off"
                    className="mt-1 bg-background text-foreground border-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-foreground">New password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="off"
                    className="mt-1 bg-background text-foreground border-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  At least 8 characters, with uppercase, lowercase, number, and special character
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-foreground">Confirm new password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="off"
                    className="mt-1 bg-background text-foreground border-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                onClick={() => changePasswordMutation.mutate()}
                disabled={
                  !currentPassword ||
                  !newPassword ||
                  newPassword !== confirmPassword ||
                  changePasswordMutation.isPending
                }
                variant="glow"
                className="text-white"
              >
                {changePasswordMutation.isPending ? "Updating..." : "Change password"}
              </Button>
            </CardContent>
          </Card>

          {/* Developer mode */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                Developer Mode
              </CardTitle>
              <CardDescription>
                Enable test features such as incident simulation. Useful for testing Sentry webhooks and incident notifications.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="dev-mode" className="cursor-pointer font-medium">
                  Enable developer mode
                </Label>
                <Switch
                  id="dev-mode"
                  checked={devMode}
                  onCheckedChange={(checked) => updateDevModeMutation.mutate(checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Incident alerts — in-app toast + optional browser notifications */}
          <Card className="border-amber-500/20 bg-amber-500/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                Incident alerts
              </CardTitle>
              <CardDescription>
                New incidents show in the app (toast in the bottom-right) and in your notification list. Enable browser notifications to get desktop alerts when the tab is in the background.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {typeof Notification !== "undefined" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Browser notifications: {Notification.permission === "granted" ? "On" : Notification.permission === "denied" ? "Blocked" : "Not set"}
                  </span>
                  {Notification.permission !== "granted" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Notification.permission === "denied"}
                      onClick={async () => {
                        const p = await Notification.requestPermission();
                        toast({
                          title: p === "granted" ? "Browser notifications enabled" : p === "denied" ? "Notifications blocked" : "Permission dismissed",
                          variant: p === "granted" ? "default" : "destructive",
                        });
                      }}
                    >
                      {Notification.permission === "denied" ? "Unblock in browser settings" : "Enable browser notifications"}
                    </Button>
                  )}
                  {Notification.permission === "granted" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sentTestBrowserNotificationMutation.mutate()}
                    >
                      Send test notification
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Incident Test — revealed when dev mode is on */}
          <Card className="border-amber-500/20 bg-amber-500/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                Incident Test
              </CardTitle>
              <CardDescription>
                Simulate Sentry-style incidents to test notifications and the incident toast.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!devMode && (
                <p className="text-muted-foreground py-2">
                  Developer mode must be activated to use these test features.
                </p>
              )}
              <Collapsible open={devMode}>
                <CollapsibleContent>
                  <div className="space-y-3 pt-1">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => simulateSentryAlertMutation.mutate(false)}
                      >
                        Simulate Sentry alert
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => simulateSentryAlertMutation.mutate(true)}
                      >
                        Simulate full pipeline
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-500/50 text-amber-700 dark:text-amber-400"
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/test/trigger-error", { credentials: "include" });
                            const data = await res.json().catch(() => ({}));
                            if (res.ok) {
                              toast({
                                title: "Test error reported",
                                description: data.message || "Sentry should have received it. Check your Sentry project and, if webhook is set up, your incident alerts.",
                              });
                            } else {
                              toast({ title: "Request failed", description: data.error || "Not found or disabled.", variant: "destructive" });
                            }
                          } catch {
                            toast({ title: "Request failed", description: "Network or server error.", variant: "destructive" });
                          }
                        }}
                      >
                        Trigger real error (Sentry)
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong>Sentry alert:</strong> One notification only. <strong>Full pipeline:</strong> Also runs incident engine (may create a second notification e.g. spike). <strong>Trigger real error:</strong> Throws on the server so Sentry captures it → new issue → alert → webhook → incident in app (proves full pipeline).
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-200 dark:border-red-900/60 bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                Danger Zone
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Irreversible actions that will permanently affect your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900/60 rounded-lg p-4 text-foreground">
                <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">Delete Account</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                  Permanently delete your account and all associated data. This action cannot be undone.
                  All your repositories, integrations, push events, and Slack connections will be deleted.
                </p>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete My Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-red-600 dark:text-red-400">
                        Are you absolutely sure?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-4">
                        <p>
                          This action cannot be undone. This will permanently delete your account
                          and remove all your data from our servers.
                        </p>
                        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md">
                          <p className="text-sm font-medium text-foreground mb-2">
                            Data that will be deleted:
                          </p>
                          <ul className="text-sm text-muted-foreground list-disc list-inside">
                            <li>Your account and profile</li>
                            <li>All connected repositories</li>
                            <li>All integrations and settings</li>
                            <li>All push event history</li>
                            <li>All Slack workspace connections</li>
                            <li>All notifications</li>
                          </ul>
                        </div>
                        <div>
                          <Label htmlFor="confirm-delete" className="text-sm font-medium">
                            Type <span className="font-bold">DELETE MY ACCOUNT</span> to confirm:
                          </Label>
                          <Input
                            id="confirm-delete"
                            value={deleteConfirmation}
                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                            placeholder="DELETE MY ACCOUNT"
                            className="mt-2"
                          />
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setDeleteConfirmation("")}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteAccountMutation.mutate()}
                        disabled={deleteConfirmation !== 'DELETE MY ACCOUNT' || deleteAccountMutation.isPending}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {deleteAccountMutation.isPending ? "Deleting..." : "Delete Account"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* GitHub disconnect confirmation */}
      <AlertDialog open={githubDisconnectModalOpen} onOpenChange={setGithubDisconnectModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect GitHub?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Disconnecting GitHub will remove your GitHub connection from PushLog. Your existing repository and integration data in PushLog will stay, but:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  <li>You will no longer see your full list of GitHub repositories</li>
                  <li>You will not be able to add new repositories until you reconnect</li>
                  <li>Webhooks for already-connected repos may stop receiving push events</li>
                </ul>
                <p className="pt-2">
                  You can reconnect GitHub anytime from this page to restore access.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => githubDisconnectMutation.mutate()}
              disabled={githubDisconnectMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {githubDisconnectMutation.isPending ? "Disconnecting…" : "Disconnect GitHub"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>
  );
}
