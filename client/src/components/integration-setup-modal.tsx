import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { SiSlack } from "react-icons/si";
import { Github } from "lucide-react";

interface Repository {
  id?: number;
  githubId: string;
  name: string;
  full_name: string; // GitHub API format
  owner: { login: string }; // GitHub API format
  default_branch: string; // GitHub API format
  isActive?: boolean;
  isConnected: boolean;
  pushEvents?: number;
  lastPush?: string;
  private: boolean;
  // Add other GitHub API fields that might be present
  [key: string]: any;
}

interface SlackWorkspace {
  id: number;
  teamId: string;
  teamName: string;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

interface IntegrationSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositories: Repository[];
}

export function IntegrationSetupModal({
  open,
  onOpenChange,
  repositories,
}: IntegrationSetupModalProps) {
  const [selectedRepository, setSelectedRepository] = useState<string>("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [notificationLevel, setNotificationLevel] = useState<"all" | "main_only" | "tagged_only">("all");
  const [includeCommitSummaries, setIncludeCommitSummaries] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's Slack workspaces (cookie-based auth)
  const { data: workspaces, isLoading: workspacesLoading } = useQuery<SlackWorkspace[]>({
    queryKey: ["/api/slack/workspaces"],
    queryFn: async () => {
      const response = await fetch('/api/slack/workspaces', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Slack workspaces');
      }

      return response.json();
    },
    enabled: open,
  });

  // Fetch channels for selected workspace (cookie-based auth)
  const { data: channels, isLoading: channelsLoading } = useQuery<SlackChannel[]>({
    queryKey: ["/api/slack/workspaces", selectedWorkspace, "channels"],
    queryFn: async () => {
      if (!selectedWorkspace) return [];

      const response = await fetch(`/api/slack/workspaces/${selectedWorkspace}/channels`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Slack channels');
      }

      return response.json();
    },
    enabled: open && !!selectedWorkspace,
  });

  // Create integration mutation (cookie-based auth)
  const createIntegrationMutation = useMutation({
    mutationFn: async (integrationData: any) => {
      const response = await fetch('/api/integrations', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(integrationData)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/repositories'] }); // Also refresh repositories
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      onOpenChange(false);
      toast({
        title: "Integration Created",
        description: "Your repository is now connected to Slack and monitoring has been enabled!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Integration Failed",
        description: error.message || "Failed to create integration.",
        variant: "destructive",
      });
    },
  });

  const handleSlackConnect = async () => {
    try {
      const response = await fetch('/api/slack/connect?popup=true', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect Slack');
      }

      if (data.url) {
        // Open in popup window for easier account switching
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        const popup = window.open(
          data.url,
          'slack-oauth',
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );

        // Listen for the popup to close (user completed OAuth)
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            // Refresh workspaces after OAuth completes
            queryClient.invalidateQueries({ queryKey: ["/api/slack/workspaces"] });
          }
        }, 500);

        // Also listen for messages from the popup (if we add postMessage)
        window.addEventListener('message', (event) => {
          if (event.data === 'slack-connected') {
            queryClient.invalidateQueries({ queryKey: ["/api/slack/workspaces"] });
            if (popup) popup.close();
          }
        });
      }
    } catch (error) {
      console.error('Failed to connect Slack:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Slack. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateIntegration = () => {
    if (!selectedRepository || !selectedWorkspace || !selectedChannel) {
      toast({
        title: "Missing Information",
        description: "Please select a repository, workspace, and channel.",
        variant: "destructive",
      });
      return;
    }

    const repository = repositories.find(r => r.id?.toString() === selectedRepository);
    const workspace = workspaces?.find(w => w.id.toString() === selectedWorkspace);
    const channel = channels?.find(c => c.id === selectedChannel);

    if (!repository || !workspace || !channel) {
      toast({
        title: "Invalid Selection",
        description: "Please check your selections and try again.",
        variant: "destructive",
      });
      return;
    }

    const integrationData = {
      userId: 0, // Server sets from session
      repositoryId: repository.id,
      slackWorkspaceId: workspace.id,
      slackChannelId: channel.id,
      slackChannelName: channel.name,
      notificationLevel,
      includeCommitSummaries,
      isActive: true,
    };

    createIntegrationMutation.mutate(integrationData);
  };

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedRepository("");
      setSelectedWorkspace("");
      setSelectedChannel("");
      setNotificationLevel("all");
      setIncludeCommitSummaries(true);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Integration</DialogTitle>
          <DialogDescription>
            Connect a repository to a Slack channel to receive push notifications. 
            If you select a paused repository, it will automatically start monitoring when you create the integration.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Repository Selection */}
          <div className="space-y-2">
            <Label htmlFor="repository">Repository</Label>
            <Select value={selectedRepository} onValueChange={setSelectedRepository}>
              <SelectTrigger>
                <SelectValue placeholder="Select a repository" />
              </SelectTrigger>
              <SelectContent>
                {repositories
                  .filter(repo => repo.isConnected && repo.id)
                  .map((repo) => {
                    const isPaused = repo.isActive === false;
                    return (
                      <SelectItem key={repo.id} value={repo.id!.toString()}>
                        <div className="flex items-center space-x-2">
                          <Github className="w-4 h-4" />
                          <span>{repo.name}</span>
                          {isPaused && (
                            <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded">
                              Currently paused
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </div>

          {/* Slack Workspace Section */}
          <div className="space-y-3 p-4 border rounded-lg bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="workspace" className="text-base font-semibold">Slack Workspace</Label>
                <p className="text-xs text-gray-500 mt-1">
                  {workspaces && workspaces.length > 0 
                    ? `Connected to ${workspaces.length} workspace${workspaces.length > 1 ? 's' : ''}`
                    : "No workspaces connected yet"}
                </p>
              </div>
              <Button 
                onClick={handleSlackConnect} 
                className="bg-log-green text-white hover:bg-green-600"
                size="default"
              >
                <SiSlack className="w-4 h-4 mr-2" />
                {workspaces && workspaces.length > 0 ? "Add Another" : "Connect Workspace"}
              </Button>
            </div>
            {workspaces && workspaces.length > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-xs text-blue-800 font-medium mb-1">💡 Connect a different Slack account?</p>
                <p className="text-xs text-blue-700">
                  To connect your work Slack (or another account), first{" "}
                  <a 
                    href="https://slack.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    log out of Slack
                  </a>
                  {" "}in your browser, then click "Add Another" above. Or use an incognito/private window.
                </p>
              </div>
            )}
            
            {/* Slack Workspace Selection */}
            <div className="space-y-2">
            {workspacesLoading ? (
              <div className="text-sm text-gray-500">Loading workspaces...</div>
            ) : workspaces && workspaces.length > 0 ? (
              <Select 
                value={selectedWorkspace} 
                onValueChange={(value) => {
                  if (value === '__add_new__') {
                    handleSlackConnect();
                  } else {
                    setSelectedWorkspace(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id.toString()}>
                      <div className="flex items-center space-x-2">
                        <SiSlack className="w-4 h-4" />
                        <span>{workspace.teamName}</span>
                      </div>
                    </SelectItem>
                  ))}
                  <div className="border-t my-1" />
                  <SelectItem value="__add_new__" className="text-sky-blue font-medium">
                    <div className="flex items-center space-x-2">
                      <SiSlack className="w-4 h-4" />
                      <span>+ Add Another Workspace</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-gray-500 p-3 bg-white rounded-md border">
                No Slack workspaces connected. Click "Connect Workspace" above to add one.
              </div>
            )}
            </div>
          </div>

          {/* Slack Channel Selection */}
          {selectedWorkspace && (
            <div className="space-y-2">
              <Label htmlFor="channel">Slack Channel</Label>
              {channelsLoading ? (
                <div className="text-sm text-gray-500">Loading channels...</div>
              ) : channels && channels.length > 0 ? (
                <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        <div className="flex items-center space-x-2">
                          <span>#{channel.name}</span>
                          {channel.is_private && (
                            <span className="text-xs text-gray-500">(private)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-gray-500">No channels available</div>
              )}
            </div>
          )}

          {/* Notification Settings */}
          <div className="space-y-4">
            <Label>Notification Settings</Label>
            
            <div className="space-y-2">
              <Label htmlFor="notification-level">Notification Level</Label>
              <Select value={notificationLevel} onValueChange={(value: any) => setNotificationLevel(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  <SelectItem value="main_only">Main branch only</SelectItem>
                  <SelectItem value="tagged_only">Tagged releases only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="commit-summaries"
                checked={includeCommitSummaries}
                onCheckedChange={(checked) => setIncludeCommitSummaries(checked as boolean)}
              />
              <Label htmlFor="commit-summaries">Include AI commit summaries</Label>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateIntegration}
            disabled={!selectedRepository || !selectedWorkspace || !selectedChannel || createIntegrationMutation.isPending}
            className="bg-log-green text-white hover:bg-green-600"
          >
            {createIntegrationMutation.isPending ? "Creating..." : "Create Integration"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 