import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { handleTokenExpiration } from "@/lib/utils";
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
  MoreVertical,
  Filter,
  Calendar,
  Activity,
  ChevronDown,
} from "lucide-react";
import { RepositorySelectModal } from "@/components/repository-select-modal";
import { RepositorySettingsModal } from "@/components/repository-settings-modal";
import { ConfirmRepositoryDeletionModal } from "@/components/confirm-repo-deletion-modal";



interface RepositoryCardData {
  id?: number;
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
  [key: string]: any;
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
  notificationLevel: string;
  includeCommitSummaries: boolean;
}

interface RepositoriesProps {
  userProfile?: any;
}

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

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch user repositories
  const { data: repositories, isLoading: repositoriesLoading } = useQuery<RepositoryCardData[]>({
    queryKey: ['/api/repositories'],
    queryFn: async () => {
      const response = await fetch('/api/repositories', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.error || 'Failed to fetch repositories');
        // Handle token expiration
        if (handleTokenExpiration(error, queryClient)) {
          return []; // Return empty array to prevent further errors
        }
        throw error;
      }
      return response.json();
    }
  });

  // Fetch user integrations
  const { data: integrations, isLoading: integrationsLoading } = useQuery<ActiveIntegration[]>({
    queryKey: ['/api/integrations'],
    queryFn: async () => {
      const response = await fetch('/api/integrations', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.error || "Failed to fetch integrations");
        // Handle token expiration
        if (handleTokenExpiration(error, queryClient)) {
          return []; // Return empty array to prevent further errors
        }
        throw error;
      }
      const data = await response.json();
      return data;
    }
  });

  // Fetch push events for repositories
  const { data: pushEvents, isLoading: pushEventsLoading } = useQuery({
    queryKey: ['/api/push-events'],
    queryFn: async () => {
      const response = await fetch('/api/push-events', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.error || "Failed to fetch push events");
        // Handle token expiration
        if (handleTokenExpiration(error, queryClient)) {
          return []; // Return empty array to prevent further errors
        }
        throw error;
      }
      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });

  // Toggle repository status mutation
  const toggleRepositoryMutation = useMutation({
    mutationFn: async ({ repositoryId, isActive }: { repositoryId: number; isActive: boolean }) => {
      const response = await fetch(`/api/repositories/${repositoryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ isActive })
      });
      return response.json();
    },
    onSuccess: () => {
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
    mutationFn: async (repoId: number) => {
      const response = await fetch(`/api/repositories/${repoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to delete repository');
      return response.json();
    },
    onSuccess: () => {
      setIsDeleteRepoConfirmationOpen(false);
      setRepositoryToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
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
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const response = await fetch(`/api/repositories/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updates)
      });
      return response.json();
    },
    onSuccess: () => {
      setIsRepositorySettingsOpen(false);
      setSelectedRepository(null);
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
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

  const handleRepositorySelect = (repository: RepositoryCardData) => {
    setIsRepoModalOpen(false);
  };

  // Filter repositories based on search and status
  const filteredRepositories = repositories?.filter(repo => {
    const matchesSearch = repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         repo.owner.login.toLowerCase().includes(searchTerm.toLowerCase());
    
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
                         repository.owner.login.toLowerCase().includes(searchTerm.toLowerCase());
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

  // Repository Card Component
  const RepositoryCard = ({ repository }: { repository: RepositoryCardData }) => {
    const repoHasIntegration = integrations?.some(
      (integration) => integration.repositoryId === repository.id
    );
    
    const repoHasActiveIntegration = integrations?.some(
      (integration) => integration.repositoryId === repository.id && integration.status === 'active'
    );
    
    const isRepositoryActive = repository.isActive !== false;
    const isConnected = repository.isConnected;
    
    // If repository is not connected to our system, show "Connect" option
    if (!isConnected) {
      return (
        <Card className="hover:shadow-md transition-shadow border-dashed border-2 border-gray-200">
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
                    {repository.owner.login}/{repository.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
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
                onClick={() => {
                  // Open integration setup modal for this repository
                  setSelectedRepository(repository);
                  setIsRepoModalOpen(true);
                }}
                className="bg-log-green text-white hover:bg-green-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                Connect Repository
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    
    // Connected repository logic (existing code)
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
      <Card className="hover:shadow-md transition-shadow">
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
                  {repository.owner.login}/{repository.name}
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
                disabled={toggleRepositoryMutation.isPending}
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
                disabled={deleteRepositoryMutation.isPending}
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-graphite">Repositories</h1>
          <p className="text-steel-gray mt-2">Connect and manage your GitHub repositories for monitoring</p>
        </div>

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
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-blue focus:border-transparent"
            />
            {/* Search Dropdown */}
            {isSearchDropdownOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                {searchResults.map((repository) => (
                  <button
                    key={repository.githubId}
                    onClick={() => handleSearchSelect(repository)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 flex items-center space-x-3"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      repository.isConnected ? (repository.isActive !== false ? 'bg-log-green' : 'bg-steel-gray') : 'bg-red-500'
                    }`} />
                    <div className="flex-1">
                      <div className="font-medium text-graphite">{repository.name}</div>
                      <div className="text-sm text-steel-gray">{repository.owner.login}/{repository.name}</div>
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
              className="pl-5 pr-5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-blue focus:border-transparent text-center text-sm bg-white flex items-center justify-between min-w-[60px] h-[42px]"
            >
              <span className="flex-1 text-center">
                {statusFilter === "all" ? "All Status" : statusFilter === "active" ? "Active" : statusFilter === "paused" ? "Paused" : "Unconnected"}
              </span>
              <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 overflow-hidden">
                <button
                  onClick={() => {
                    setStatusFilter("all");
                    setActiveTab("all");
                    setIsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                >
                  All Status
                </button>
                <button
                  onClick={() => {
                    setStatusFilter("active");
                    setActiveTab("active");
                    setIsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                >
                  Active
                </button>
                <button
                  onClick={() => {
                    setStatusFilter("paused");
                    setActiveTab("paused");
                    setIsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                >
                  Paused
                </button>
                <button
                  onClick={() => {
                    setStatusFilter("unconnected");
                    setActiveTab("unconnected");
                    setIsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                >
                  Unconnected
                </button>
              </div>
            )}
          </div>
          <Button 
            onClick={() => setIsRepoModalOpen(true)}
            className="bg-log-green text-white hover:bg-green-600"
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
                  <RepositoryCard key={repository.githubId} repository={repository} />
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
                    onClick={() => setIsRepoModalOpen(true)}
                    className="bg-log-green text-white hover:bg-green-600"
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
                  <RepositoryCard key={repository.githubId} repository={repository} />
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
                  <RepositoryCard key={repository.githubId} repository={repository} />
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
                  <RepositoryCard key={repository.githubId} repository={repository} />
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
      />

      {/* Events Modal */}
      {selectedRepositoryForEvents && (
        <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center ${isEventsModalOpen ? 'block' : 'hidden'}`}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-graphite">
                    Push Events - {selectedRepositoryForEvents.name}
                  </h2>
                  <p className="text-sm text-steel-gray mt-1">
                    {selectedRepositoryForEvents.owner.login}/{selectedRepositoryForEvents.name}
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
                          {events.map((event: any, index: number) => (
                            <div key={index} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  <div className="w-2 h-2 bg-log-green rounded-full"></div>
                                  <span className="font-medium text-graphite">
                                    Push to {event.branch || 'main'}
                                  </span>
                                </div>
                                <span className="text-sm text-steel-gray">
                                  {new Date(event.timestamp).toLocaleString()}
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
