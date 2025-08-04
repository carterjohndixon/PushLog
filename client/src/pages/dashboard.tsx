import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Github, 
  GitBranch, 
  Bell, 
  LinkIcon, 
  Plus,
  Settings,
  Play,
  Pause,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { SiSlack } from "react-icons/si";
import { RepositorySelectModal } from "@/components/repository-select-modal";
import { IntegrationSetupModal } from "@/components/integration-setup-modal";
import { ConfirmIntegrationDeletionModal } from "@/components/confirm-integration-deletion-modal";
import { ConfirmRepositoryDeletionModal } from "@/components/confirm-repo-deletion-modal";

interface DashboardStats {
  totalRepositories: number;
  totalPushEvents: number;
  activeIntegrations: number;
  dailyPushes: number[];
  totalNotifications: number;
}

interface RepositoryCardData {
  id?: number;
  githubId: string;
  name: string;
  fullName: string;
  owner: string;
  branch: string;
  isActive: boolean;
  isConnected: boolean;
  pushEvents?: number;
  lastPush?: string;
  private: boolean;
}

interface ConnectRepositoryData {
  userId: number;
  githubId: string;
  name: string;
  fullName: string;
  owner: string;
  branch: string;
  isActive: boolean;
  private: boolean;
}

interface ActiveIntegration {
  id: number;
  repositoryId: number;
  type: string;
  name: string;
  isActive: boolean;
  lastUsed: string;
  status: string;
  repositoryName: string;
  slackChannelName: string;
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [isDeleteRepoConfirmationOpen, setIsDeleteRepoConfirmationOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(localStorage.getItem('userId') || '0');

  // Listen for userId changes in localStorage
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'userId') {
        setCurrentUserId(e.newValue || '0');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    // Check for error or success in URL hash
    const hash = window.location.hash;
    if (hash.startsWith('#error=')) {
      const error = decodeURIComponent(hash.substring(7));
      toast({
        title: "Connection Failed",
        description: error,
        variant: "destructive",
      });
      // Clean up the URL without reloading
      window.history.replaceState(null, '', window.location.pathname);
    } else if (hash.startsWith('#slack=connected')) {
      toast({
        title: "Slack Connected",
        description: "Your Slack workspace has been successfully connected!",
      });
      // Clean up the URL without reloading
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [toast]);

  // Fetch user profile to get userId when component mounts
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && currentUserId === '0') {
      fetch('/api/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => response.json())
      .then(data => {
        if (data.success && data.user) {
          const userId = data.user.id;
          localStorage.setItem('userId', userId.toString());
          setCurrentUserId(userId.toString());
          console.log('Setting userId in localStorage:', userId);
        }
      })
      .catch(error => {
        console.error('Failed to fetch user profile:', error);
      });
    }
  }, [currentUserId]);

  const handleGitHubConnect = async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      toast({
        title: "Authentication Required",
        description: "Please log in to connect your GitHub account.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Use apiRequest to make an authenticated request
      const response = await apiRequest("GET", "/api/github/connect");
      
      // Parse the JSON response to get the URL
      const data = await response.json();
      
      if (data.url) {
        // Store the state for verification in the callback
        if (data.state) {
          localStorage.setItem('github_oauth_state', data.state);
        }
        localStorage.setItem('returnPath', window.location.pathname);
        window.location.href = data.url;
      } else {
        throw new Error('No redirect URL received');
      }
    } catch (error) {
      console.error('Failed to initiate GitHub connection:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to GitHub. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Connect repository mutation
  const connectRepositoryMutation = useMutation({
    mutationFn: async (repository: ConnectRepositoryData) => {
      const response = await fetch('/api/repositories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(repository)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/repositories?userId=${currentUserId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/stats?userId=${currentUserId}`] });
      setIsRepoModalOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect repository.",
        variant: "destructive",
      });
    },
  });

  const handleRepositorySelect = (repository: RepositoryCardData) => {
    const connectData: ConnectRepositoryData = {
      userId: parseInt(currentUserId),
      githubId: repository.githubId,
      name: repository.name,
      fullName: repository.fullName,
      owner: repository.owner,
      branch: repository.branch,
      isActive: true,
      private: repository.private
    };
    connectRepositoryMutation.mutate(connectData, {
      onSuccess: (data) => {
        // Close modal and refetch data after successful mutation
        setIsRepoModalOpen(false);
        queryClient.invalidateQueries({ queryKey: [`/api/repositories?userId=${currentUserId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/stats?userId=${currentUserId}`] });
        
        // Show specific notification for the repository that was just connected
        if (data.warning) {
          toast({
            // TODO: 
            title: "Repository Connected with Warning",
            description: data.warning,
            variant: "default",
          });
        } else {
          toast({
            title: "Repository Connected",
            description: `${repository.name} has been successfully connected to PushLog.`,
          });
        }
      },
      onError: (error: any) => {
        toast({
          title: "Connection Failed",
          description: error.message || "Failed to connect repository.",
          variant: "destructive",
        });
      }
    });
  };

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: [`/api/stats?userId=${currentUserId}`],
  });

  // Fetch user repositories
  const { data: repositories, isLoading: repositoriesLoading, error: repositoriesError } = useQuery<RepositoryCardData[]>({
    queryKey: [`/api/repositories?userId=${currentUserId}`],
    queryFn: async () => {
      const response = await fetch (`/api/repositories?userId=${currentUserId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        // If the error indicates an expired token, invalidate the profile query to refresh connection status
        if (errorData.error && errorData.error.includes('expired')) {
          queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        }
        throw new Error(errorData.error || 'Failed to fetch repositories');
      }
      return response.json();
    }
  });

  // Fetch user integrations
  const { data: integrations, isLoading: integrationsLoading } = useQuery<ActiveIntegration[]>({
    queryKey: [`/api/integrations?userId=${currentUserId}`],
    queryFn: async () => {
      const response = await fetch(`/api/integrations?userId=${currentUserId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error("Failed to fetch integrations");
      const data = await response.json();
      // Map isActive boolean to status string
      return data.map((integration: any) => ({
        ...integration,
        status: integration.isActive ? 'active' : 'paused',
      }));
    }
  });

  // Add after other useQuery hooks
  const { data: slackWorkspaces, isLoading: slackWorkspacesLoading } = useQuery({
    queryKey: ["/api/slack/workspaces"],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      if (!token) return [];
      const response = await fetch('/api/slack/workspaces', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const handleSlackConnect = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast({
        title: "Authentication Required",
        description: "Please log in to connect your Slack workspace.",
        variant: "destructive",
      });
      return;
    }
    try {
      const response = await fetch('/api/slack/connect', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to connect Slack');
      if (data.url) window.location.href = data.url;
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Slack. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Toggle integration status mutation
  const toggleIntegrationMutation = useMutation({
    mutationFn: async ({ integrationId, isActive }: { integrationId: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/integrations/${integrationId}`, {
        isActive,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/integrations?userId=${currentUserId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/stats?userId=${currentUserId}`] });
      toast({
        title: "Integration Updated",
        description: "Integration status has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update integration.",
        variant: "destructive",
      });
    },
  });

  // Delete integration mutation
  const deleteIntegrationMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      try {
        const response = await apiRequest("DELETE", `/api/integrations/${integrationId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      
        const data = await response.json();
        console.log('Response data:', data);
        return data;
      } catch (error) {
        console.error('Delete mutation error:', error);
        throw error;
      }
    },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/integrations?userId=${currentUserId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/stats?userId=${currentUserId}`] });
        setIsDeleteConfirmationOpen(false);
        setIntegrationToDelete(null);
        toast({
          title: "Integration Deleted",
          description: "Integration has been successfully removed.",
        });
      },
      onError: (error: any) => {
        toast({
          title: "Delete Failed",
          description: "Failed to delete integration.",
          variant: "destructive",
        });
      },
  });
  
  // Delete repository mutation
  const deleteRepositoryMutation = useMutation({
    mutationFn: async (repoId: number) => {
      try {
        const response = await apiRequest("DELETE", `/api/repositories/${repoId}`);
        // /api/repositories/:id
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      
        const data = await response.json();
        console.log('Response data:', data);
        return data;
      } catch (error) {
        console.error('Delete mutation error:', error);
        throw error;
      }
    },
    onMutate: async (repoId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/repositories?userId=${currentUserId}`] });
      
      // Snapshot the previous value
      const previousRepositories = queryClient.getQueryData([`/api/repositories?userId=${currentUserId}`]);
      
      // Optimistically update to remove the repository
      queryClient.setQueryData([`/api/repositories?userId=${currentUserId}`], (old: any) => {
        if (!old) return old;
        return old.filter((repo: any) => repo.id !== repoId);
      });
      
      // Return a context object with the snapshotted value
      return { previousRepositories };
    },
      onSuccess: () => {
        // Invalidate all related queries to ensure real-time updates
        queryClient.invalidateQueries({ queryKey: [`/api/repositories?userId=${currentUserId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/stats?userId=${currentUserId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/integrations?userId=${currentUserId}`] });
        setIsDeleteRepoConfirmationOpen(false);
        setRepositoryToDelete(null);
        toast({
          title: "Repository Deleted",
          description: "Repository has been successfully removed.",
        });
      },
      onError: (error: any, repoId, context) => {
        // Rollback the optimistic update
        if (context?.previousRepositories) {
          queryClient.setQueryData([`/api/repositories?userId=${currentUserId}`], context.previousRepositories);
        }
        
        toast({
          title: "Delete Failed",
          description: "Failed to delete Repository.",
          variant: "destructive",
        });
      },
  });

  const handleToggleIntegration = (integration: ActiveIntegration) => {
    const newStatus = integration.status === 'active' ? false : true;
    toggleIntegrationMutation.mutate({
      integrationId: integration.id,
      isActive: newStatus,
    });
  };

  const handleDeleteIntegration = (integration: ActiveIntegration) => {
    setIsDeleteConfirmationOpen(true);
    setIntegrationToDelete(integration);
  };

  const handleDeleteRepository = (repository: RepositoryCardData) => {
    setIsDeleteRepoConfirmationOpen(true);
    setRepositoryToDelete(repository);
  }

  const [integrationToDelete, setIntegrationToDelete] = useState<ActiveIntegration | null>(null);
  const [repositoryToDelete, setRepositoryToDelete] = useState<RepositoryCardData | null>(null);

  // Fetch user profile
  const { data: userProfile } = useQuery({
    queryKey: ["/api/profile"],
    queryFn: async () => {
      const response = await fetch("/api/profile", {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        throw new Error("Failed to fetch user profile");
      }
      return response.json();
    }
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-graphite">Dashboard</h1>
          <p className="text-steel-gray mt-2">Manage your integrations and monitor repository activity</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-steel-gray">Active Integrations</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-8 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-log-green">{stats?.activeIntegrations || 0}</p>
                  )}
                </div>
                <div className="w-12 h-12 bg-log-green bg-opacity-10 rounded-lg flex items-center justify-center">
                  <LinkIcon className="text-log-green w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-steel-gray">Connected Repos</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-8 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-sky-blue">{stats?.totalRepositories || 0}</p>
                  )}
                </div>
                <div className="w-12 h-12 bg-sky-blue bg-opacity-10 rounded-lg flex items-center justify-center">
                  <Github className="text-sky-blue w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-steel-gray">Daily Pushes</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-8 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-graphite">{stats?.dailyPushes || 0}</p>
                  )}
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <GitBranch className="text-log-green w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-steel-gray">Notifications Sent</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-8 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-steel-gray">{stats?.totalNotifications || 0}</p>
                  )}
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Bell className="text-sky-blue w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Connected Repositories */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-graphite">Connected Repositories</CardTitle>
                <Button 
                  size="sm" 
                  className="bg-log-green text-white hover:bg-green-600"
                  onClick={() => setIsRepoModalOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Repo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {repositoriesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center space-x-3 p-3">
                      <Skeleton className="w-8 h-8 rounded" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="w-12 h-6 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : repositoriesError ? (
                // ERROR STATE - Show this FIRST, before checking for empty repos
                <div className="text-center py-8">
                  <Github className="w-12 h-12 text-steel-gray mx-auto mb-4" />
                  <h3 className="font-medium text-graphite mb-2">GitHub Connection Needs Refresh</h3>
                  <p className="text-sm text-steel-gray mb-4">
                    Your GitHub token may have expired or been revoked. Please reconnect your GitHub account.
                  </p>
                  <p className="text-xs text-gray-400 mb-4">Error: {repositoriesError.message}</p>
                  <Button onClick={handleGitHubConnect} className="bg-log-green text-white hover:bg-green-600">
                    <Github className="w-4 h-4 mr-2" />
                    Reconnect GitHub
                  </Button>
                </div>
              ) : repositories && repositories.some(repo => repo.isConnected) ? (
                <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
                  {repositories
                    .filter(repo => repo.isConnected)
                    .map((repo) => {
                      const repoHasIntegration = integrations?.some(
                        (integration) => integration.repositoryId === repo.id
                      );
                      
                      const repoHasActiveIntegration = integrations?.some(
                        (integration) => integration.repositoryId === repo.id && integration.status === 'active'
                      );
                      
                      let statusText = 'Connected';
                      let statusColor = 'bg-steel-gray';
                      let badgeVariant: "default" | "secondary" | "outline" = "outline";
                      
                      if (repoHasIntegration) {
                        // Has integration - check if it's active
                        statusText = repoHasActiveIntegration ? 'Active' : 'Paused';
                        statusColor = repoHasActiveIntegration ? 'bg-log-green' : 'bg-steel-gray';
                        badgeVariant = repoHasActiveIntegration ? "default" : "secondary";
                      }
                      
                      return (
                        <div key={repo.githubId} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                              <Github className="text-white w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-medium text-graphite">{repo.name}</p>
                              <p className="text-xs text-steel-gray">
                                {repo.lastPush ? `Last push: ${repo.lastPush}` : 'No recent activity'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                            <Badge variant={badgeVariant} className="text-xs">
                              {statusText}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteRepository(repo)}
                              disabled={deleteRepositoryMutation.isPending}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Github className="w-12 h-12 text-steel-gray mx-auto mb-4" />
                  <h3 className="font-medium text-graphite mb-2">No Connected Repositories</h3>
                  <p className="text-sm text-steel-gray mb-4">
                    {userProfile?.user?.githubConnected 
                      ? "Click the 'Add Repo' button above to start monitoring your repositories."
                      : "Connect your GitHub account to start monitoring repositories."}
                  </p>
                  {!userProfile?.user?.githubConnected && (
                    <Button onClick={handleGitHubConnect} className="bg-log-green text-white hover:bg-green-600">
                      <Github className="w-4 h-4 mr-2" />
                      Connect GitHub
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Integrations */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-graphite">Active Integrations</CardTitle>
                <Button 
                  size="sm" 
                  className="bg-sky-blue text-white hover:bg-blue-600"
                  onClick={() => setIsIntegrationModalOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Integration
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {integrationsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Skeleton className="w-10 h-10 rounded-lg" />
                        <div>
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                      <Skeleton className="w-16 h-6 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : integrations && integrations.length > 0 ? (
                <div className="space-y-4">
                  {integrations.map((integration) => (
                    <div key={integration.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          integration.status === 'active' ? 'bg-log-green bg-opacity-10' : 'bg-steel-gray bg-opacity-10'
                        }`}>
                          <SiSlack className={`${integration.status === 'active' ? 'text-log-green' : 'text-steel-gray'}`} />
                        </div>
                        <div>
                          <p className="font-medium text-graphite">{integration.repositoryName}</p>
                          <p className="text-sm text-steel-gray">{integration.slackChannelName} channel</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${
                          integration.status === 'active' ? 'bg-log-green' : 'bg-steel-gray'
                        }`} />
                        <Badge 
                          variant={integration.status === 'active' ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {integration.status === 'active' ? 'Active' : 'Paused'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleIntegration(integration)}
                          disabled={toggleIntegrationMutation.isPending}
                        >
                          {integration.status === 'active' ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteIntegration(integration)}
                          disabled={deleteIntegrationMutation.isPending}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <SiSlack className="w-12 h-12 text-steel-gray mx-auto mb-4" />
                  <h3 className="font-medium text-graphite mb-2">No integrations configured</h3>
                  {slackWorkspacesLoading ? (
                    <p className="text-sm text-steel-gray mb-4">Checking Slack connection...</p>
                  ) : slackWorkspaces && slackWorkspaces.length === 0 ? (
                    <>
                      <p className="text-sm text-steel-gray mb-4">Connect your Slack workspace to start creating integrations.</p>
                      <Button 
                        onClick={handleSlackConnect}
                        className="bg-sky-blue text-white hover:bg-blue-600"
                      >
                        <SiSlack className="w-4 h-4 mr-2" />
                        Connect Slack Workspace
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-steel-gray mb-4">Set up your first integration to start receiving notifications.</p>
                      <Button 
                        onClick={() => setIsIntegrationModalOpen(true)}
                        className="bg-sky-blue text-white hover:bg-blue-600"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Integration
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-graphite">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button 
                variant="outline" 
                className="flex items-center justify-center space-x-2 p-6 h-auto"
                onClick={() => setIsIntegrationModalOpen(true)}
              >
                <Plus className="w-5 h-5 text-log-green" />
                <span>Set Up New Integration</span>
              </Button>
              
              <Button 
                variant="outline" 
                className="flex items-center justify-center space-x-2 p-6 h-auto"
                onClick={() => {
                  toast({
                    title: "Coming Soon",
                    description: "Analytics dashboard is coming soon.",
                  });
                }}
              >
                <TrendingUp className="w-5 h-5 text-sky-blue" />
                <span>View Analytics</span>
              </Button>
              
              <Button 
                variant="outline" 
                className="flex items-center justify-center space-x-2 p-6 h-auto"
                onClick={() => {
                  toast({
                    title: "Coming Soon",
                    description: "Settings panel is coming soon.",
                  });
                }}
              >
                <Settings className="w-5 h-5 text-steel-gray" />
                <span>Integration Settings</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      
      <Footer />

      <RepositorySelectModal
        open={isRepoModalOpen}
        onOpenChange={setIsRepoModalOpen}
        onRepositorySelect={handleRepositorySelect}
      />

      <IntegrationSetupModal
        open={isIntegrationModalOpen}
        onOpenChange={setIsIntegrationModalOpen}
        repositories={repositories || []}
      />

      <ConfirmRepositoryDeletionModal 
        open={isDeleteRepoConfirmationOpen}
        onOpenChange={setIsDeleteRepoConfirmationOpen}
        repositoryToDelete={repositoryToDelete}
        deleteRepositoryMutation={deleteRepositoryMutation}
      />

      <ConfirmIntegrationDeletionModal
        open={isDeleteConfirmationOpen}
        onOpenChange={setIsDeleteConfirmationOpen}
        integrationToDelete={integrationToDelete}
        deleteIntegrationMutation={deleteIntegrationMutation}
      />
    </div>
  );
}
