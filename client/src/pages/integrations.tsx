import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { handleTokenExpiration } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus,
  Play,
  Pause,
  Trash2,
  Search,
  Clock,
  Activity,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  MoreVertical,
} from "lucide-react";
import { SiSlack } from "react-icons/si";
import { IntegrationSetupModal } from "@/components/integration-setup-modal";
import { ConfirmIntegrationDeletionModal } from "@/components/confirm-integration-deletion-modal";
import { IntegrationSettingsModal } from "@/components/integration-settings-modal";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { ActiveIntegration, RepositoryCardData } from "@/lib/types";

interface IntegrationsProps {
  userProfile?: any;
}

export default function Integrations({ userProfile }: IntegrationsProps) {
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] = useState<ActiveIntegration | null>(null);
  const [isIntegrationSettingsOpen, setIsIntegrationSettingsOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<ActiveIntegration | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [activeTab, setActiveTab] = useState("all");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

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
      return data.map((integration: any) => ({
        ...integration,
        status: integration.isActive ? 'active' : 'paused',
      }));
    }
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
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
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

  // Update integration mutation
  const updateIntegrationMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const response = await apiRequest("PATCH", `/api/integrations/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setIsIntegrationSettingsOpen(false);
      setSelectedIntegration(null);
      toast({
        title: "Integration Updated",
        description: "Integration settings have been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update integration settings.",
        variant: "destructive",
      });
    },
  });

  // Delete integration mutation
  const deleteIntegrationMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      const response = await apiRequest("DELETE", `/api/integrations/${integrationId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setIsDeleteConfirmationOpen(false);
      setIntegrationToDelete(null);
      toast({
        title: "Integration Deleted",
        description: "Integration has been successfully removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete integration.",
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
    setIntegrationToDelete(integration);
    setIsDeleteConfirmationOpen(true);
  };

  const handleIntegrationSettings = (integration: ActiveIntegration) => {
    setSelectedIntegration(integration);
    setIsIntegrationSettingsOpen(true);
  };

  const handleSearchSelect = (integration: ActiveIntegration) => {
    setSearchTerm("");
    setIsSearchDropdownOpen(false);
    // Switch to the appropriate tab based on integration status
    if (integration.status === "active") {
      setActiveTab("active");
      setStatusFilter("active");
    } else if (integration.status === "paused") {
      setActiveTab("paused");
      setStatusFilter("paused");
    } else {
      setActiveTab("all");
      setStatusFilter("all");
    }
  };

  // Filter integrations based on search and status
  const filteredIntegrations = integrations?.filter(integration => {
    const matchesSearch = integration.repositoryName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         integration.slackChannelName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || integration.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  // Search results for dropdown (all integrations, not filtered by status)
  const searchResults = integrations?.filter(integration => {
    const matchesSearch = integration.repositoryName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         integration.slackChannelName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && searchTerm.length > 0;
  }) || [];

  // Group integrations by status for tabs
  const activeIntegrations = integrations?.filter(i => i.status === 'active') || [];
  const pausedIntegrations = integrations?.filter(i => i.status === 'paused') || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-log-green" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-steel-gray" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-steel-gray" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-log-green text-white';
      case 'paused':
        return 'bg-steel-gray text-white';
      case 'error':
        return 'bg-red-500 text-white';
      default:
        return 'bg-steel-gray text-white';
    }
  };

  const IntegrationCard = ({ integration }: { integration: ActiveIntegration }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex flex-col h-full">
          {/* Top section with main content */}
          <div className="flex items-start space-x-4 mb-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              integration.status === 'active' ? 'bg-log-green bg-opacity-10' : 'bg-steel-gray bg-opacity-10'
            }`}>
              <SiSlack className={`w-6 h-6 ${
                integration.status === 'active' ? 'text-log-green' : 'text-steel-gray'
              }`} />
            </div>
            <div className="flex-1">
              <div className="mb-2">
                <h3 className="font-semibold text-graphite">{integration.repositoryName}</h3>
              </div>
              <p className="text-sm text-steel-gray mb-2">
                <SiSlack className="w-3 h-3 inline mr-1" />
                #{integration.slackChannelName}
              </p>
              {integration.lastActivity && (
                <div className="flex items-center space-x-1 text-xs text-steel-gray">
                  <Activity className="w-3 h-3" />
                  <span>Last activity: {integration.lastActivity}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Bottom section with actions and status */}
          <div className="flex items-center justify-between mt-auto">
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleToggleIntegration(integration)}
                disabled={toggleIntegrationMutation.isPending}
                className="hover:bg-gray-100"
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
                onClick={() => handleIntegrationSettings(integration)}
                className="text-steel-gray hover:text-graphite"
              >
                <MoreVertical className="w-4 h-4" />
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
            <Badge 
              variant={integration.status === 'active' ? "default" : "secondary"}
              className={`text-xs ${getStatusColor(integration.status)}`}
            >
              {integration.status === 'active' ? 'Active' : 'Paused'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Email Verification Banner */}
        {userProfile && !userProfile.emailVerified && (
          <EmailVerificationBanner />
        )}
        
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-graphite">Integrations</h1>
              <p className="text-steel-gray mt-2">
                {integrationsLoading ? "Loading..." : "Manage your GitHub to Slack integrations"}
              </p>
            </div>
            <Button 
              onClick={() => setIsIntegrationModalOpen(true)}
              className="bg-sky-blue text-white hover:bg-blue-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Integration
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-steel-gray">Total Integrations</p>
                  {integrationsLoading ? (
                    <Skeleton className="h-8 w-8 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-graphite">{integrations?.length || 0}</p>
                  )}
                </div>
                <div className="w-12 h-12 bg-sky-blue bg-opacity-10 rounded-lg flex items-center justify-center">
                  <SiSlack className="text-sky-blue w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-steel-gray">Active</p>
                  {integrationsLoading ? (
                    <Skeleton className="h-8 w-8 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-log-green">{activeIntegrations.length}</p>
                  )}
                </div>
                <div className="w-12 h-12 bg-log-green bg-opacity-10 rounded-lg flex items-center justify-center">
                  <CheckCircle className="text-log-green w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-steel-gray">Paused</p>
                  {integrationsLoading ? (
                    <Skeleton className="h-8 w-8 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-steel-gray">{pausedIntegrations.length}</p>
                  )}
                </div>
                <div className="w-12 h-12 bg-steel-gray bg-opacity-10 rounded-lg flex items-center justify-center">
                  <Pause className="text-steel-gray w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-steel-gray w-4 h-4" />
            <input
              type="text"
              placeholder="Search integrations..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsSearchDropdownOpen(e.target.value.length > 0);
              }}
              onFocus={() => setIsSearchDropdownOpen(searchTerm.length > 0)}
              onBlur={() => setTimeout(() => setIsSearchDropdownOpen(false), 200)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-blue focus:border-transparent"
            />
            {/* Search Dropdown */}
            {isSearchDropdownOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                {searchResults.map((integration) => (
                  <button
                    key={integration.id}
                    onClick={() => handleSearchSelect(integration)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 flex items-center space-x-3"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      integration.status === 'active' ? 'bg-log-green' : 'bg-steel-gray'
                    }`} />
                    <div className="flex-1">
                      <div className="font-medium text-graphite">{integration.repositoryName}</div>
                      <div className="text-sm text-steel-gray">#{integration.slackChannelName}</div>
                    </div>
                    <Badge 
                      variant={integration.status === 'active' ? "default" : "secondary"}
                      className={`text-xs ${
                        integration.status === 'active' ? 'bg-log-green text-white' : 'bg-steel-gray text-white'
                      }`}
                    >
                      {integration.status === 'active' ? 'Active' : 'Paused'}
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
                {statusFilter === "all" ? "All Status" : statusFilter === "active" ? "Active" : "Paused"}
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
              </div>
            )}
          </div>
        </div>

        {/* Integrations Tabs */}
        <Tabs 
          value={activeTab} 
          onValueChange={(value) => {
            setActiveTab(value);
            // Update filter to match the selected tab
            if (value === "active") {
              setStatusFilter("active");
            } else if (value === "paused") {
              setStatusFilter("paused");
            } else {
              setStatusFilter("all");
            }
          }} 
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All ({integrations?.length || 0})</TabsTrigger>
            <TabsTrigger value="active">Active ({activeIntegrations.length})</TabsTrigger>
            <TabsTrigger value="paused">Paused ({pausedIntegrations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {integrationsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="flex items-start space-x-4">
                        <Skeleton className="w-12 h-12 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredIntegrations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredIntegrations.map((integration) => (
                  <IntegrationCard key={integration.id} integration={integration} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <SiSlack className="w-16 h-16 text-steel-gray mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-graphite mb-2">No integrations found</h3>
                  <p className="text-steel-gray mb-6">
                    {searchTerm || statusFilter !== "all" 
                      ? "Try adjusting your search or filter criteria."
                      : "Get started by creating your first integration."
                    }
                  </p>
                  {!searchTerm && statusFilter === "all" && (
                    <Button 
                      onClick={() => setIsIntegrationModalOpen(true)}
                      className="bg-sky-blue text-white hover:bg-blue-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Integration
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="active" className="space-y-4">
            {activeIntegrations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeIntegrations.map((integration) => (
                  <IntegrationCard key={integration.id} integration={integration} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <CheckCircle className="w-16 h-16 text-steel-gray mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-graphite mb-2">No active integrations</h3>
                  <p className="text-steel-gray mb-6">All your integrations are currently paused.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="paused" className="space-y-4">
            {pausedIntegrations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pausedIntegrations.map((integration) => (
                  <IntegrationCard key={integration.id} integration={integration} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Pause className="w-16 h-16 text-steel-gray mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-graphite mb-2">No paused integrations</h3>
                  <p className="text-steel-gray mb-6">All your integrations are currently active.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
      
      <Footer />

      <IntegrationSetupModal
        open={isIntegrationModalOpen}
        onOpenChange={setIsIntegrationModalOpen}
        repositories={repositories?.map(repo => ({
          ...repo,
          full_name: `${repo.owner}/${repo.name}`,
          default_branch: repo.branch || 'main',
          owner: { login: repo.owner }
        })) || []}
      />

      <IntegrationSettingsModal
        open={isIntegrationSettingsOpen}
        onOpenChange={setIsIntegrationSettingsOpen}
        integration={selectedIntegration}
        updateIntegrationMutation={updateIntegrationMutation}
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
