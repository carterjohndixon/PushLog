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
  fullName: string;
  owner: string;
  branch: string;
  isActive: boolean;
  isConnected: boolean;
  pushEvents?: number;
  lastPush?: string;
  private: boolean;
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

  const currentUserId = localStorage.getItem('userId');

  // Fetch user's Slack workspaces
  const { data: workspaces, isLoading: workspacesLoading } = useQuery<SlackWorkspace[]>({
    queryKey: ["/api/slack/workspaces"],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication required');

      const response = await fetch('/api/slack/workspaces', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Slack workspaces');
      }

      return response.json();
    },
    enabled: open,
  });

  // Fetch channels for selected workspace
  const { data: channels, isLoading: channelsLoading } = useQuery<SlackChannel[]>({
    queryKey: ["/api/slack/workspaces", selectedWorkspace, "channels"],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      if (!token || !selectedWorkspace) throw new Error('Authentication required');

      const response = await fetch(`/api/slack/workspaces/${selectedWorkspace}/channels`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Slack channels');
      }

      return response.json();
    },
    enabled: open && !!selectedWorkspace,
  });

  // Create integration mutation
  const createIntegrationMutation = useMutation({
    mutationFn: async (integrationData: any) => {
      const response = await fetch('/api/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
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
      queryClient.invalidateQueries({ queryKey: [`/api/integrations?userId=${currentUserId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/stats?userId=${currentUserId}`] });
      onOpenChange(false);
      toast({
        title: "Integration Created",
        description: "Your repository is now connected to Slack!",
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
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect Slack');
      }

      if (data.url) {
        window.location.href = data.url;
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
      userId: parseInt(currentUserId || '0'),
      repositoryId: repository.id,
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
            Connect a repository to a Slack channel to receive push notifications
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
                    return (
                      <SelectItem key={repo.id} value={repo.id!.toString()}>
                        <div className="flex items-center space-x-2">
                          <Github className="w-4 h-4" />
                          <span>{repo.name}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </div>

          {/* Slack Workspace Selection */}
          <div className="space-y-2">
            <Label htmlFor="workspace">Slack Workspace</Label>
            {workspacesLoading ? (
              <div className="text-sm text-gray-500">Loading workspaces...</div>
            ) : workspaces && workspaces.length > 0 ? (
              <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
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
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-gray-500">No Slack workspaces connected</div>
                <Button onClick={handleSlackConnect} className="bg-sky-blue text-white hover:bg-blue-600">
                  <SiSlack className="w-4 h-4 mr-2" />
                  Connect Slack Workspace
                </Button>
              </div>
            )}
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