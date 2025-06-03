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
  Users, 
  LinkIcon, 
  Plus,
  Settings,
  Play,
  Pause,
  Trash2,
  TrendingUp,
  Clock
} from "lucide-react";
import { SiSlack } from "react-icons/si";
import type { 
  DashboardStats, 
  RecentPushEvent, 
  ActiveIntegration, 
  RepositoryCardData 
} from "@/lib/types";

// Mock user ID for now - in real app this would come from auth
const CURRENT_USER_ID = 1;

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: [`/api/stats?userId=${CURRENT_USER_ID}`],
  });

  // Fetch user repositories
  const { data: repositories, isLoading: repositoriesLoading } = useQuery<RepositoryCardData[]>({
    queryKey: [`/api/repositories?userId=${CURRENT_USER_ID}`],
  });

  // Fetch user integrations
  const { data: integrations, isLoading: integrationsLoading } = useQuery<ActiveIntegration[]>({
    queryKey: [`/api/integrations?userId=${CURRENT_USER_ID}`],
  });

  // Connect repository mutation
  const connectRepositoryMutation = useMutation({
    mutationFn: async (repoData: any) => {
      const response = await apiRequest("POST", "/api/repositories", {
        ...repoData,
        userId: CURRENT_USER_ID,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/repositories?userId=${CURRENT_USER_ID}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/stats?userId=${CURRENT_USER_ID}`] });
      toast({
        title: "Repository Connected",
        description: "Repository has been successfully connected to PushLog.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect repository.",
        variant: "destructive",
      });
    },
  });

  // Toggle integration status mutation
  const toggleIntegrationMutation = useMutation({
    mutationFn: async ({ integrationId, isActive }: { integrationId: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/integrations/${integrationId}`, {
        isActive,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/integrations?userId=${CURRENT_USER_ID}`] });
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

  const handleConnectRepository = (repository: RepositoryCardData) => {
    connectRepositoryMutation.mutate({
      githubId: repository.githubId,
      name: repository.name,
      fullName: repository.fullName,
      owner: repository.owner,
      branch: repository.branch,
      isActive: true,
    });
  };

  const handleToggleIntegration = (integration: ActiveIntegration) => {
    const newStatus = integration.status === 'active' ? false : true;
    toggleIntegrationMutation.mutate({
      integrationId: integration.id,
      isActive: newStatus,
    });
  };

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
                  onClick={() => {
                    // In real app, this would open a repository selection modal
                    toast({
                      title: "GitHub Integration",
                      description: "Please connect your GitHub account first.",
                    });
                  }}
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
              ) : repositories && repositories.length > 0 ? (
                <div className="space-y-3">
                  {repositories.slice(0, 5).map((repo) => (
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
                        {repo.isConnected ? (
                          <>
                            <div className={`w-2 h-2 rounded-full ${repo.isActive ? 'bg-log-green' : 'bg-steel-gray'}`} />
                            <Badge variant={repo.isActive ? "default" : "secondary"} className="text-xs">
                              {repo.isActive ? 'Active' : 'Paused'}
                            </Badge>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleConnectRepository(repo)}
                            disabled={connectRepositoryMutation.isPending}
                          >
                            Connect
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Github className="w-12 h-12 text-steel-gray mx-auto mb-4" />
                  <h3 className="font-medium text-graphite mb-2">No repositories connected</h3>
                  <p className="text-sm text-steel-gray mb-4">Connect your GitHub account to start monitoring repositories.</p>
                  <Button className="bg-log-green text-white hover:bg-green-600">
                    <Github className="w-4 h-4 mr-2" />
                    Connect GitHub
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Integrations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-graphite">Active Integrations</CardTitle>
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
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <SiSlack className="w-12 h-12 text-steel-gray mx-auto mb-4" />
                  <h3 className="font-medium text-graphite mb-2">No integrations configured</h3>
                  <p className="text-sm text-steel-gray mb-4">Set up your first integration to start receiving notifications.</p>
                  <Button className="bg-sky-blue text-white hover:bg-blue-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Integration
                  </Button>
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
                onClick={() => {
                  toast({
                    title: "Coming Soon",
                    description: "Integration setup wizard is coming soon.",
                  });
                }}
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
    </div>
  );
}
