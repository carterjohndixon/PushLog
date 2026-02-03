import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Download, 
  Trash2, 
  Shield, 
  Database, 
  AlertTriangle,
  CheckCircle,
  Github,
  Mail,
  CreditCard
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

  // Fetch account data summary
  const { data: dataSummary, isLoading } = useQuery<DataSummary>({
    queryKey: ["/api/account/data-summary"],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch('/api/account/data-summary', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch data summary');
      return response.json();
    }
  });

  // Export data mutation
  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/account/export', {
        headers: { 'Authorization': `Bearer ${token}` }
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

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
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
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
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
                        {new Date(dataSummary.accountCreated).toLocaleDateString()}
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

          {/* Danger Zone */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible actions that will permanently affect your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-800 mb-2">Delete Account</h3>
                <p className="text-sm text-red-700 mb-4">
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
                      <AlertDialogTitle className="text-red-600">
                        Are you absolutely sure?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-4">
                        <p>
                          This action cannot be undone. This will permanently delete your account
                          and remove all your data from our servers.
                        </p>
                        <div className="bg-gray-100 p-3 rounded-md">
                          <p className="text-sm font-medium text-graphite mb-2">
                            Data that will be deleted:
                          </p>
                          <ul className="text-sm text-steel-gray list-disc list-inside">
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

      <Footer />
    </div>
  );
}
