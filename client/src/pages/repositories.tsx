import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { handleTokenExpiration } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Github, 
  GitBranch, 
  Search,
  Plus,
  Settings,
  Trash2,
  Play,
  Pause,
  Calendar,
  Activity,
  ChevronDown,
} from "lucide-react";
import { RepositorySelectModal } from "@/components/repository-select-modal";
import { RepositorySettingsModal } from "@/components/repository-settings-modal";
import { ConfirmRepositoryDeletionModal } from "@/components/confirm-repo-deletion-modal";

interface RepositoryCardData {
  id?: string;
  githubId: string;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  isActive?: boolean;
  isConnected: boolean;
  pushEvents?: number;
  lastPush?: string;
  private: boolean;
  monitorAllBranches?: boolean;
  integrationCount?: number;
  [key: string]: any;
}

interface ActiveIntegration {
  id: string;
  repositoryId: string;
  type: string;
  name: string;
  isActive: boolean;
  lastUsed: string;
  status: string;
  repositoryName: string;
  slackChannelName: string;
  notificationLevel: string;
  includeCommitSummaries: boolean;
}

interface RepositoriesProps {
  userProfile?: any;
}

const ownerLogin = (repo: RepositoryCardData) => typeof repo.owner === "string" ? repo.owner : repo.owner?.login ?? "";

interface RepositoryCardProps {
  repository: RepositoryCardData;
  onConnectRepository?: (repository: RepositoryCardData) => void;
  integrations: ActiveIntegration[];
  connectingRepoId: string | null;
  setSelectedRepository: (repository: RepositoryCardData) => void;
  setIsRepoModalOpen: (open: boolean) => void;
  setSelectedRepositoryForEvents: (repository: RepositoryCardData) => void;
  setIsEventsModalOpen: (open: boolean) => void;
  handleToggleRepository: (repository: RepositoryCardData) => void;
  toggleRepositoryIsPending: boolean;
  handleRepositorySettings: (repository: RepositoryCardData) => void;
  handleDeleteRepository: (repository: RepositoryCardData) => void;
  deleteRepositoryIsPending: boolean;
  getRepositoryEvents: (repository: RepositoryCardData) => { count: number; events: any[] };
}

const RepositoryCard = ({
  repository,
  onConnectRepository,
  integrations,
  connectingRepoId,
  setSelectedRepository,
  setIsRepoModalOpen,
  setSelectedRepositoryForEvents,
  setIsEventsModalOpen,
  handleToggleRepository,
  toggleRepositoryIsPending,
  handleRepositorySettings,
  handleDeleteRepository,
  deleteRepositoryIsPending,
  getRepositoryEvents,
}: RepositoryCardProps) => {
  const repoHasIntegration = integrations?.some(
    (integration) => integration.repositoryId === repository.id
  );
  
  const repoHasActiveIntegration = integrations?.some(
    (integration) => integration.repositoryId === repository.id && integration.status === 'active'
  );
  
  const isRepositoryActive = repository.isActive !== false;
  const isConnected = repository.isConnected;
  
  if (!isConnected) {
    return (
      <Card className="card-lift hover:shadow-md transition-shadow border-dashed border-2 border-gray-200 dark:border-[hsl(var(--log-green)/0.6)]">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="w-10 h-10 flex-shrink-0 bg-gray-900 rounded-lg flex items-center justify-center">
                <Github className="text-white w-5 h-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg font-semibold text-foreground truncate">
                  {repository.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground truncate">
                  {ownerLogin(repository)}/{repository.name}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <Badge variant="outline" className="text-xs text-red-600 border-red-300 whitespace-nowrap">
                Unconnected
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <GitBranch className="w-4 h-4 text-steel-gray" />
              <span className="text-steel-gray">Branch:</span>
              <span className="font-medium text-graphite">{repository.default_branch}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-steel-gray" />
              <span className="text-steel-gray">Type:</span>
              <span className="font-medium text-graphite">{repository.private ? 'Private' : 'Public'}</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div className="text-xs text-steel-gray">
              Available to connect
            </div>
            
            <Button
              size="sm"
              variant="glow"
              onClick={() => {
                if (onConnectRepository) {
                  onConnectRepository(repository);
                } else {
                  setSelectedRepository(repository);
                  setIsRepoModalOpen(true);
                }
              }}
              disabled={connectingRepoId === String(repository.githubId)}
              className="text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              {connectingRepoId === String(repository.githubId) ? "Connecting…" : "Connect Repository"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  let statusText = 'Connected';
  let statusColor = 'bg-steel-gray';
  let badgeVariant: "default" | "secondary" | "outline" = "outline";
  
  if (repoHasIntegration) {
    const isActive = isRepositoryActive && repoHasActiveIntegration;
    statusText = isActive ? 'Active' : 'Paused';
    statusColor = isActive ? 'bg-log-green' : 'bg-steel-gray';
    badgeVariant = isActive ? "default" : "secondary";
  } else {
    statusText = isRepositoryActive ? 'Connected' : 'Paused';
    statusColor = isRepositoryActive ? 'bg-sky-blue' : 'bg-steel-gray';
    badgeVariant = isRepositoryActive ? "outline" : "secondary";
  }

  return (
    <Card className="card-lift hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
              <Github className="text-white w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-graphite">
                {repository.name}
              </CardTitle>
              <p className="text-sm text-steel-gray">
                {ownerLogin(repository)}/{repository.name}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
            <Badge variant={badgeVariant} className="text-xs">
              {statusText}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <GitBranch className="w-4 h-4 text-steel-gray" />
            <span className="text-steel-gray">Branch:</span>
            <span className="font-medium text-graphite">{repository.default_branch}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-steel-gray" />
            <span className="text-steel-gray">Events:</span>
            <button
              onClick={() => {
                setSelectedRepositoryForEvents(repository);
                setIsEventsModalOpen(true);
              }}
              className="font-medium text-graphite hover:text-log-green hover:underline cursor-pointer"
              disabled={!repository.id}
            >
              {getRepositoryEvents(repository).count}
            </button>
          </div>
        </div>
        
        {repository.lastPush && (
          <div className="flex items-center space-x-2 text-sm">
            <Calendar className="w-4 h-4 text-steel-gray" />
            <span className="text-steel-gray">Last activity:</span>
            <span className="font-medium text-graphite">{repository.lastPush}</span>
          </div>
        )}
        
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="text-xs text-steel-gray">
            {repoHasIntegration 
              ? `${repoHasActiveIntegration && isRepositoryActive ? 'Active' : 'Paused'} integration`
              : 'No integration configured'
            }
          </div>
          
          <div className="flex items-center space-x-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleToggleRepository(repository)}
              disabled={toggleRepositoryIsPending}
              className="text-steel-gray hover:text-graphite"
            >
              {isRepositoryActive ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleRepositorySettings(repository)}
              className="text-steel-gray hover:text-graphite"
            >
              <Settings className="w-4 h-4" />
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteRepository(repository)}
              disabled={deleteRepositoryIsPending}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function Repositories({ userProfile }: RepositoriesProps) {
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [isRepositorySettingsOpen, setIsRepositorySettingsOpen] = useState(false);
  const [isDeleteRepoConfirmationOpen, setIsDeleteRepoConfirmationOpen] = useState(false);
  const [selectedRepository, setSelectedRepository] = useState<RepositoryCardData | null>(null);
  const [repositoryToDelete, setRepositoryToDelete] = useState<RepositoryCardData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "unconnected">("all");
  const [activeTab, setActiveTab] = useState("all");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  const [selectedRepositoryForEvents, setSelectedRepositoryForEvents] = useState<RepositoryCardData | null>(null);
  const [connectingRepoId, setConnectingRepoId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Single request for repos + integrations (faster load); also populate separate caches for modals
  const { data: reposAndIntegrations, isLoading: reposAndIntegrationsLoading } = useQuery<{
    repositories: RepositoryCardData[];
    integrations: ActiveIntegration[];
    requiresGitHubReconnect?: boolean;
  }>({
    queryKey: ['/api/repositories-and-integrations'],
    queryFn: async () => {
      const response = await fetch('/api/repositories-and-integrations', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || 'Failed to fetch repositories and integrations');
        if (handleTokenExpiration(error, queryClient)) {
          return { repositories: [], integrations: [] };
        }
        throw error;
      }
      const data = await response.json();
      const integrations = (data.integrations ?? []).map((i: any) => ({
        ...i,
        status: i.isActive ? 'active' : 'paused',
      }));
      queryClient.setQueryData(['/api/repositories'], data.repositories ?? []);
      queryClient.setQueryData(['/api/integrations'], integrations);
      return {
        repositories: data.repositories ?? [],
        integrations,
        requiresGitHubReconnect: !!data.requiresGitHubReconnect,
      };
    },
  });
  const repositories = reposAndIntegrations?.repositories ?? [];
  const integrations = reposAndIntegrations?.integrations ?? [];
  const requiresGitHubReconnect = reposAndIntegrations?.requiresGitHubReconnect ?? false;
  const repositoriesLoading = reposAndIntegrationsLoading;

  // Fetch push events for repositories
  const { data: pushEvents, isLoading: pushEventsLoading } = useQuery({
    queryKey: ['/api/push-events'],
    queryFn: async () => {
      const response = await fetch('/api/push-events', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || "Failed to fetch push events");
        if (handleTokenExpiration(error, queryClient)) {
          return [];
        }
        throw error;
      }
      return response.json();
    },
    refetchInterval: 30000,
  });

  // Toggle repository status mutation
  const toggleRepositoryMutation = useMutation({
    mutationFn: async ({ repositoryId, isActive }: { repositoryId: string; isActive: boolean }) => {
      const response = await fetch(`/api/repositories/${repositoryId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ isActive })
      });
      if (!response.ok) throw new Error('Failed to update repository');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/repositories-and-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Repository Updated",
        description: "Repository status has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update repository.",
        variant: "destructive",
      });
    },
  });

  // Delete repository mutation
  const deleteRepositoryMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const response = await fetch(`/api/repositories/${repoId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to delete repository');
      return response.json();
    },
    onSuccess: () => {
      setIsDeleteRepoConfirmationOpen(false);
      setRepositoryToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['/api/repositories-and-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Repository Deleted",
        description: "Repository has been successfully removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete repository.",
        variant: "destructive",
      });
    },
  });

  // Update repository mutation
  const updateRepositoryMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const response = await fetch(`/api/repositories/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error('Failed to update repository');
      return response.json();
    },
    onSuccess: () => {
      setIsRepositorySettingsOpen(false);
      setSelectedRepository(null);
      queryClient.invalidateQueries({ queryKey: ['/api/repositories-and-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Settings Updated",
        description: "Repository settings have been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update repository settings.",
        variant: "destructive",
      });
    },
  });

  const handleToggleRepository = (repository: RepositoryCardData) => {
    if (!repository.id) return;
    
    const newStatus = repository.isActive !== false ? false : true;
    

    
    toggleRepositoryMutation.mutate({
      repositoryId: repository.id,
      isActive: newStatus,
    });
  };

  const handleRepositorySettings = (repository: RepositoryCardData) => {
    setSelectedRepository(repository);
    setIsRepositorySettingsOpen(true);
  };

  const handleDeleteRepository = (repository: RepositoryCardData) => {
    setRepositoryToDelete(repository);
    setIsDeleteRepoConfirmationOpen(true);
  };

  const connectRepositoryMutation = useMutation({
    mutationFn: async (repository: RepositoryCardData) => {
      const ownerLogin = typeof repository.owner === "string" ? repository.owner : repository.owner?.login ?? "";
      const body = {
        name: repository.name,
        owner: ownerLogin,
        githubId: Number(repository.githubId) || repository.githubId,
        fullName: repository.full_name ?? (repository as any).fullName,
        branch: repository.default_branch || (repository as any).branch || "main",
        isActive: true,
      };
      const response = await fetch("/api/repositories", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to connect repository");
      }
      return response.json();
    },
    onMutate: (repository) => {
      setConnectingRepoId(String(repository.githubId));
    },
    onSuccess: (data, repository) => {
      setConnectingRepoId(null);
      const repoId = String(repository.githubId);
      // Update cache so the list re-renders with this repo as connected (no refetch = no race)
      queryClient.setQueryData(
        ["/api/repositories-and-integrations"],
        (prev: { repositories: RepositoryCardData[]; integrations: ActiveIntegration[] } | undefined) => {
          if (!prev) return prev;
          const repositories = prev.repositories.map((r) =>
            String(r.githubId) === repoId
              ? { ...r, isConnected: true, id: data.id ?? r.id }
              : r
          );
          return { ...prev, repositories };
        }
      );
      // Switch to Active tab so the newly connected repo is visible (it moved from Unconnected → Active)
      setActiveTab("active");
      setStatusFilter("active");
      toast({
        title: "Repository connected",
        description: data.warning ?? `${repository.name} has been connected to PushLog.`,
        variant: data.warning ? "default" : "default",
      });
    },
    onError: (error: Error) => {
      setConnectingRepoId(null);
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect repository.",
        variant: "destructive",
      });
    },
  });

  const handleConnectRepository = (repository: RepositoryCardData) => {
    connectRepositoryMutation.mutate(repository);
  };

  const handleRepositorySelect = (repository: RepositoryCardData) => {
    setIsRepoModalOpen(false);
  };

  // Filter repositories based on search and status
  const filteredRepositories = repositories?.filter(repo => {
    const matchesSearch = repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ownerLogin(repo).toLowerCase().includes(searchTerm.toLowerCase());
    
    const isRepositoryActive = repo.isActive !== false;
    const isConnected = repo.isConnected;
    
    const matchesStatus = statusFilter === "all" || 
                         (statusFilter === "active" && isConnected && isRepositoryActive) ||
                         (statusFilter === "paused" && isConnected && !isRepositoryActive) ||
                         (statusFilter === "unconnected" && !isConnected);
    
    return matchesSearch && matchesStatus;
  }) || [];

  // Group repositories by status
  const connectedActiveRepositories = filteredRepositories.filter(repo => repo.isConnected && repo.isActive !== false);
  const connectedPausedRepositories = filteredRepositories.filter(repo => repo.isConnected && repo.isActive === false);
  const unconnectedRepositories = filteredRepositories.filter(repo => !repo.isConnected);

  // Search results for dropdown (all repositories, not filtered by status)
  const searchResults = repositories?.filter(repository => {
    const matchesSearch = repository.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ownerLogin(repository).toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && searchTerm.length > 0;
  }) || [];

  // Calculate events for a repository
  const getRepositoryEvents = (repository: RepositoryCardData) => {
    if (!pushEvents || !repository.id) return { count: 0, events: [] };
    
    const repoEvents = pushEvents.filter((event: any) => 
      event.repositoryId === repository.id
    );
    
    return {
      count: repoEvents.length,
      events: repoEvents.sort((a: any, b: any) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
    };
  };

  const handleSearchSelect = (repository: RepositoryCardData) => {
    setSearchTerm("");
    setIsSearchDropdownOpen(false);
    // Switch to the appropriate tab based on repository status
    if (repository.isConnected && repository.isActive !== false) {
      setActiveTab("active");
      setStatusFilter("active");
    } else if (repository.isConnected && repository.isActive === false) {
      setActiveTab("paused");
      setStatusFilter("paused");
    } else if (!repository.isConnected) {
      setActiveTab("unconnected");
      setStatusFilter("unconnected");
    } else {
      setActiveTab("all");
      setStatusFilter("all");
    }
  };

  return (
    <div className="min-h-screen bg-forest-gradient">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-graphite">Repositories</h1>
          <p className="text-steel-gray mt-2">Connect and manage your GitHub repositories for monitoring</p>
        </div>

        {requiresGitHubReconnect && (
          <div className="mb-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100">
            <p className="font-medium">GitHub connection needed to see all repos and add new ones</p>
            <p className="text-sm mt-1">Reconnect your GitHub account to list all repositories and connect new ones.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-amber-600 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
              onClick={() => window.location.href = "/settings"}
            >
              Go to Settings to reconnect GitHub
            </Button>
          </div>
        )}

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-steel-gray w-4 h-4" />
            <input
              type="text"
              placeholder="Search repositories..."
              value={searchTerm}
              onChange={(e) => {
                const newSearchTerm = e.target.value;
                setSearchTerm(newSearchTerm);
                setIsSearchDropdownOpen(newSearchTerm.length > 0);
              }}
              onFocus={() => setIsSearchDropdownOpen(searchTerm.length > 0)}
              onBlur={() => setTimeout(() => setIsSearchDropdownOpen(false), 200)}
              className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent"
            />
            {/* Search Dropdown */}
            {isSearchDropdownOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                {searchResults.map((repository) => (
                  <button
                    key={repository.githubId}
                    onClick={() => handleSearchSelect(repository)}
                    className="w-full px-4 py-3 text-left hover:bg-muted border-b border-border last:border-b-0 flex items-center space-x-3"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      repository.isConnected ? (repository.isActive !== false ? 'bg-log-green' : 'bg-steel-gray') : 'bg-red-500'
                    }`} />
                    <div className="flex-1">
                      <div className="font-medium text-graphite">{repository.name}</div>
                      <div className="text-sm text-steel-gray">{ownerLogin(repository)}/{repository.name}</div>
                    </div>
                    <Badge 
                      variant="outline"
                      className={`text-xs ${
                        repository.isConnected 
                          ? (repository.isActive !== false ? 'bg-log-green text-white border-log-green' : 'bg-steel-gray text-white border-steel-gray')
                          : 'text-red-600 border-red-300'
                      }`}
                    >
                      {repository.isConnected 
                        ? (repository.isActive !== false ? 'Active' : 'Paused')
                        : 'Unconnected'
                      }
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="pl-5 pr-5 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent text-center text-sm bg-background flex items-center justify-between min-w-[60px] h-[42px]"
            >
              <span className="flex-1 text-center">
                {statusFilter === "all" ? "All Status" : statusFilter === "active" ? "Active" : statusFilter === "paused" ? "Paused" : "Unconnected"}
              </span>
              <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                <button
                  onClick={() => {
                    setStatusFilter("all");
                    setActiveTab("all");
                    setIsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  All Status
                </button>
                <button
                  onClick={() => {
                    setStatusFilter("active");
                    setActiveTab("active");
                    setIsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  Active
                </button>
                <button
                  onClick={() => {
                    setStatusFilter("paused");
                    setActiveTab("paused");
                    setIsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  Paused
                </button>
                <button
                  onClick={() => {
                    setStatusFilter("unconnected");
                    setActiveTab("unconnected");
                    setIsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  Unconnected
                </button>
              </div>
            )}
          </div>
          <Button 
            variant="glow"
            onClick={() => setIsRepoModalOpen(true)}
            className="text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Repository
          </Button>
        </div>

        {/* Repositories Tabs */}
        <Tabs 
          value={activeTab} 
          onValueChange={(value) => {
            setActiveTab(value);
            // Update filter to match the selected tab
            if (value === "active") {
              setStatusFilter("active");
            } else if (value === "paused") {
              setStatusFilter("paused");
            } else if (value === "unconnected") {
              setStatusFilter("unconnected");
            } else {
              setStatusFilter("all");
            }
          }} 
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">All ({filteredRepositories.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({connectedActiveRepositories.length})</TabsTrigger>
            <TabsTrigger value="paused">Paused ({connectedPausedRepositories.length})</TabsTrigger>
            <TabsTrigger value="unconnected">Unconnected ({unconnectedRepositories.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {repositoriesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader className="pb-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                        <div className="space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-24" />
                          <div className="h-3 bg-gray-200 rounded w-32" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="h-3 bg-gray-200 rounded w-full" />
                        <div className="h-3 bg-gray-200 rounded w-3/4" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredRepositories.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRepositories.map((repository) => (
                  <RepositoryCard
                    key={repository.githubId}
                    repository={repository}
                    onConnectRepository={handleConnectRepository}
                    integrations={integrations}
                    connectingRepoId={connectingRepoId}
                    setSelectedRepository={setSelectedRepository}
                    setIsRepoModalOpen={setIsRepoModalOpen}
                    setSelectedRepositoryForEvents={setSelectedRepositoryForEvents}
                    setIsEventsModalOpen={setIsEventsModalOpen}
                    handleToggleRepository={handleToggleRepository}
                    toggleRepositoryIsPending={toggleRepositoryMutation.isPending}
                    handleRepositorySettings={handleRepositorySettings}
                    handleDeleteRepository={handleDeleteRepository}
                    deleteRepositoryIsPending={deleteRepositoryMutation.isPending}
                    getRepositoryEvents={getRepositoryEvents}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Github className="w-16 h-16 text-steel-gray mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-graphite mb-2">No repositories found</h3>
                  <p className="text-steel-gray mb-6">
                    {searchTerm || statusFilter !== "all" 
                      ? "Try adjusting your search or filter criteria."
                      : "Connect your first repository to start monitoring."
                    }
                  </p>
                  <Button 
                    variant="glow"
                    onClick={() => setIsRepoModalOpen(true)}
                    className="text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Repository
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="active" className="space-y-4">
            {connectedActiveRepositories.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {connectedActiveRepositories.map((repository) => (
                  <RepositoryCard
                    key={repository.githubId}
                    repository={repository}
                    onConnectRepository={handleConnectRepository}
                    integrations={integrations}
                    connectingRepoId={connectingRepoId}
                    setSelectedRepository={setSelectedRepository}
                    setIsRepoModalOpen={setIsRepoModalOpen}
                    setSelectedRepositoryForEvents={setSelectedRepositoryForEvents}
                    setIsEventsModalOpen={setIsEventsModalOpen}
                    handleToggleRepository={handleToggleRepository}
                    toggleRepositoryIsPending={toggleRepositoryMutation.isPending}
                    handleRepositorySettings={handleRepositorySettings}
                    handleDeleteRepository={handleDeleteRepository}
                    deleteRepositoryIsPending={deleteRepositoryMutation.isPending}
                    getRepositoryEvents={getRepositoryEvents}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Play className="w-16 h-16 text-steel-gray mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-graphite mb-2">No active repositories</h3>
                  <p className="text-steel-gray mb-6">All your repositories are currently paused.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="paused" className="space-y-4">
            {connectedPausedRepositories.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {connectedPausedRepositories.map((repository) => (
                  <RepositoryCard
                    key={repository.githubId}
                    repository={repository}
                    onConnectRepository={handleConnectRepository}
                    integrations={integrations}
                    connectingRepoId={connectingRepoId}
                    setSelectedRepository={setSelectedRepository}
                    setIsRepoModalOpen={setIsRepoModalOpen}
                    setSelectedRepositoryForEvents={setSelectedRepositoryForEvents}
                    setIsEventsModalOpen={setIsEventsModalOpen}
                    handleToggleRepository={handleToggleRepository}
                    toggleRepositoryIsPending={toggleRepositoryMutation.isPending}
                    handleRepositorySettings={handleRepositorySettings}
                    handleDeleteRepository={handleDeleteRepository}
                    deleteRepositoryIsPending={deleteRepositoryMutation.isPending}
                    getRepositoryEvents={getRepositoryEvents}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Pause className="w-16 h-16 text-steel-gray mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-graphite mb-2">No paused repositories</h3>
                  <p className="text-steel-gray mb-6">All your repositories are currently active.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="unconnected" className="space-y-4">
            {unconnectedRepositories.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {unconnectedRepositories.map((repository) => (
                  <RepositoryCard
                    key={repository.githubId}
                    repository={repository}
                    onConnectRepository={handleConnectRepository}
                    integrations={integrations}
                    connectingRepoId={connectingRepoId}
                    setSelectedRepository={setSelectedRepository}
                    setIsRepoModalOpen={setIsRepoModalOpen}
                    setSelectedRepositoryForEvents={setSelectedRepositoryForEvents}
                    setIsEventsModalOpen={setIsEventsModalOpen}
                    handleToggleRepository={handleToggleRepository}
                    toggleRepositoryIsPending={toggleRepositoryMutation.isPending}
                    handleRepositorySettings={handleRepositorySettings}
                    handleDeleteRepository={handleDeleteRepository}
                    deleteRepositoryIsPending={deleteRepositoryMutation.isPending}
                    getRepositoryEvents={getRepositoryEvents}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Github className="w-16 h-16 text-steel-gray mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-graphite mb-2">No unconnected repositories</h3>
                  <p className="text-steel-gray mb-6">All your repositories are currently connected.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
      
      <Footer />

      <RepositorySelectModal
        open={isRepoModalOpen}
        onOpenChange={setIsRepoModalOpen}
        onRepositorySelect={handleRepositorySelect}
      />

      <RepositorySettingsModal
        open={isRepositorySettingsOpen}
        onOpenChange={setIsRepositorySettingsOpen}
        repository={selectedRepository}
        updateRepositoryMutation={updateRepositoryMutation}
      />

      <ConfirmRepositoryDeletionModal 
        open={isDeleteRepoConfirmationOpen}
        onOpenChange={setIsDeleteRepoConfirmationOpen}
        repositoryToDelete={repositoryToDelete}
        deleteRepositoryMutation={deleteRepositoryMutation}
        integrationCount={repositoryToDelete?.integrationCount ?? 0}
      />

      {/* Events Modal */}
      {selectedRepositoryForEvents && (
        <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center ${isEventsModalOpen ? 'block' : 'hidden'}`}>
          <div className="bg-card rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-graphite">
                    Push Events - {selectedRepositoryForEvents.name}
                  </h2>
                  <p className="text-sm text-steel-gray mt-1">
                    {selectedRepositoryForEvents ? ownerLogin(selectedRepositoryForEvents) : ""}/{selectedRepositoryForEvents?.name ?? ""}
                  </p>
                </div>
                <button
                  onClick={() => setIsEventsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {pushEventsLoading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-4 border-log-green border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-steel-gray">Loading events...</p>
                </div>
              ) : (
                <div>
                  {(() => {
                    const { count, events } = getRepositoryEvents(selectedRepositoryForEvents);
                    return count > 0 ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-medium text-graphite">
                            {count} Push Event{count !== 1 ? 's' : ''}
                          </h3>
                          <Badge variant="outline" className="text-xs">
                            Real-time updates
                          </Badge>
                        </div>
                        
                        <div className="space-y-3">
                          {events.map((event: any) => (
                            <div key={event.id} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  <div className="w-2 h-2 bg-log-green rounded-full"></div>
                                  <span className="font-medium text-graphite">
                                    Push to {event.branch || 'main'}
                                  </span>
                                </div>
                                <span className="text-sm text-steel-gray">
                                  {formatLocalDateTime(event.timestamp)}
                                </span>
                              </div>
                              
                              {event.commitMessage && (
                                <p className="text-sm text-steel-gray mb-2">
                                  "{event.commitMessage}"
                                </p>
                              )}
                              
                              <div className="flex items-center justify-between text-xs text-steel-gray">
                                <span>By {event.author || 'Unknown'}</span>
                                {event.commitHash && (
                                  <span className="font-mono">
                                    {event.commitHash.substring(0, 8)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Activity className="w-16 h-16 text-steel-gray mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-graphite mb-2">No push events yet</h3>
                        <p className="text-steel-gray">
                          Push events will appear here when you make commits to this repository.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
