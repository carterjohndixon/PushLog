"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { SiSlack } from "react-icons/si";
import { Github } from "lucide-react";

interface Repository {
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
  [key: string]: unknown;
}

interface SlackWorkspace {
  id: string;
  teamId: string;
  teamName: string;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

type NotificationLevel = "all" | "main_only" | "tagged_only";

interface CreateIntegrationVariables {
  repositoryId: string;
  slackWorkspaceId: string;
  slackChannelId: string;
  slackChannelName: string;
  notificationLevel: NotificationLevel;
  includeCommitSummaries: boolean;
}

interface IntegrationSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositories: Repository[];
  onIntegrationCreated?: (data: unknown, variables: CreateIntegrationVariables) => void;
}

const DEFAULT_NOTIFICATION_LEVEL: NotificationLevel = "all";

function resetFormState(
  setSelectedRepository: (v: string) => void,
  setSelectedWorkspace: (v: string) => void,
  setSelectedChannel: (v: string) => void,
  setNotificationLevel: (v: NotificationLevel) => void,
  setIncludeCommitSummaries: (v: boolean) => void
) {
  setSelectedRepository("");
  setSelectedWorkspace("");
  setSelectedChannel("");
  setNotificationLevel(DEFAULT_NOTIFICATION_LEVEL);
  setIncludeCommitSummaries(true);
}

export function IntegrationSetupModal({
  open,
  onOpenChange,
  repositories,
  onIntegrationCreated,
}: IntegrationSetupModalProps) {
  const [selectedRepository, setSelectedRepository] = useState<string>("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [notificationLevel, setNotificationLevel] = useState<NotificationLevel>(DEFAULT_NOTIFICATION_LEVEL);
  const [includeCommitSummaries, setIncludeCommitSummaries] = useState(true);
  const messageListenerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset all form fields when the modal opens so we never show another integration's data.
  useEffect(() => {
    if (open) {
      resetFormState(
        setSelectedRepository,
        setSelectedWorkspace,
        setSelectedChannel,
        setNotificationLevel,
        setIncludeCommitSummaries
      );
    }
  }, [open]);

  // When workspace changes, clear channel so we don't show a channel from the previous workspace.
  useEffect(() => {
    if (open) {
      setSelectedChannel("");
    }
  }, [open, selectedWorkspace]);

  const { data: workspaces, isLoading: workspacesLoading } = useQuery<SlackWorkspace[]>({
    queryKey: ["/api/slack/workspaces"],
    queryFn: async () => {
      const response = await fetch("/api/slack/workspaces", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Failed to fetch Slack workspaces");
      return response.json();
    },
    enabled: open,
  });

  const { data: channels, isLoading: channelsLoading } = useQuery<SlackChannel[]>({
    queryKey: ["/api/slack/workspaces", selectedWorkspace, "channels"],
    queryFn: async () => {
      if (!selectedWorkspace) return [];
      const response = await fetch(`/api/slack/workspaces/${selectedWorkspace}/channels`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Failed to fetch Slack channels");
      return response.json();
    },
    enabled: open && Boolean(selectedWorkspace),
  });

  const createIntegrationMutation = useMutation({
    mutationFn: async (payload: CreateIntegrationVariables & { isActive: boolean }) => {
      const response = await fetch("/api/integrations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const raw = await response.text();
        let message = raw;
        try {
          const data = JSON.parse(raw) as { details?: string; error?: string };
          message = data.details ?? data.error ?? raw;
        } catch {
          // keep raw
        }
        throw new Error(message);
      }
      return response.json() as Promise<Record<string, unknown>>;
    },
    onSuccess(data, variables) {
      if (onIntegrationCreated) {
        onIntegrationCreated(data, variables);
      } else {
        queryClient.setQueryData(
          ["/api/repositories-and-integrations"],
          (prev: { repositories: Repository[]; integrations: unknown[] } | undefined) => {
            if (!prev) return prev;
            const repositoryName =
              repositories.find((r) => r.id?.toString() === variables.repositoryId)?.name ?? "Unknown Repository";
            const { openRouterApiKey: _, ...rest } = data as Record<string, unknown>;
            const newIntegration = {
              ...rest,
              repositoryName,
              lastUsed: data.createdAt ?? null,
              status: (data as { isActive?: boolean }).isActive ? "active" : "paused",
              notificationLevel: (data as { notificationLevel?: string }).notificationLevel ?? "all",
              includeCommitSummaries: (data as { includeCommitSummaries?: boolean }).includeCommitSummaries ?? true,
            };
            return {
              ...prev,
              integrations: [...(prev.integrations ?? []), newIntegration],
            };
          }
        );
      }
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/repositories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/repositories-and-integrations"] });
      onOpenChange(false);
      const channelName = variables.slackChannelName;
      toast({
        title: "Integration Created",
        description: channelName
          ? `Connected! Make sure to run /invite @PushLog in #${channelName} so the bot can post messages.`
          : "Your repository is now connected to Slack and monitoring has been enabled!",
      });
    },
    onError(error: Error) {
      toast({
        title: "Integration Failed",
        description: error.message || "Failed to create integration.",
        variant: "destructive",
      });
    },
  });

  const handleSlackConnect = useCallback(async () => {
    try {
      const response = await fetch("/api/slack/connect?popup=true", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to connect Slack");
      }
      if (!data.url) return;

      const width = 600;
      const height = 700;
      const left = Math.max(0, (window.screen.width - width) / 2);
      const top = Math.max(0, (window.screen.height - height) / 2);
      const popup = window.open(
        data.url,
        "slack-oauth",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      const intervalId = setInterval(() => {
        if (popup?.closed) {
          clearInterval(intervalId);
          queryClient.invalidateQueries({ queryKey: ["/api/slack/workspaces"] });
        }
      }, 500);

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.data !== "slack-connected") return;
        queryClient.invalidateQueries({ queryKey: ["/api/slack/workspaces"] });
        if (messageListenerRef.current) {
          window.removeEventListener("message", messageListenerRef.current);
          messageListenerRef.current = null;
        }
        popup?.close();
      };
      if (messageListenerRef.current) {
        window.removeEventListener("message", messageListenerRef.current);
        messageListenerRef.current = null;
      }
      messageListenerRef.current = handleMessage;
      window.addEventListener("message", handleMessage);
    } catch (err) {
      console.error("Failed to connect Slack:", err);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Slack. Please try again.",
        variant: "destructive",
      });
    }
  }, [queryClient, toast]);

  useEffect(() => {
    return () => {
      if (messageListenerRef.current) {
        window.removeEventListener("message", messageListenerRef.current);
        messageListenerRef.current = null;
      }
    };
  }, []);

  const handleCreateIntegration = useCallback(() => {
    if (!selectedRepository || !selectedWorkspace || !selectedChannel) {
      toast({
        title: "Missing Information",
        description: "Please select a repository, workspace, and channel.",
        variant: "destructive",
      });
      return;
    }

    const repository = repositories.find((r) => r.id?.toString() === selectedRepository);
    const workspace = workspaces?.find((w) => w.id.toString() === selectedWorkspace);
    const channel = channels?.find((c) => c.id === selectedChannel);

    if (!repository?.id || !workspace || !channel) {
      toast({
        title: "Invalid Selection",
        description: "Please check your selections and try again.",
        variant: "destructive",
      });
      return;
    }

    const variables: CreateIntegrationVariables = {
      repositoryId: String(repository.id),
      slackWorkspaceId: String(workspace.id),
      slackChannelId: String(channel.id),
      slackChannelName: String(channel.name),
      notificationLevel,
      includeCommitSummaries,
    };
    createIntegrationMutation.mutate({ ...variables, isActive: true });
  }, [
    selectedRepository,
    selectedWorkspace,
    selectedChannel,
    notificationLevel,
    includeCommitSummaries,
    repositories,
    workspaces,
    channels,
    toast,
    createIntegrationMutation,
  ]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetFormState(
          setSelectedRepository,
          setSelectedWorkspace,
          setSelectedChannel,
          setNotificationLevel,
          setIncludeCommitSummaries
        );
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  const handleNotificationLevelChange = useCallback((value: string) => {
    if (value === "all" || value === "main_only" || value === "tagged_only") {
      setNotificationLevel(value);
    }
  }, []);

  const connectedRepos = repositories.filter(
    (repo): repo is Repository & { id: string } => Boolean(repo.isConnected && repo.id)
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Integration</DialogTitle>
          <DialogDescription>
            Connect a repository to a Slack channel to receive push notifications. If you select a paused
            repository, it will automatically start monitoring when you create the integration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="repository">Repository</Label>
            <Select value={selectedRepository} onValueChange={setSelectedRepository}>
              <SelectTrigger id="repository">
                <SelectValue placeholder="Select a repository" />
              </SelectTrigger>
              <SelectContent>
                {connectedRepos.map((repo) => {
                  const isPaused = repo.isActive === false;
                  return (
                    <SelectItem key={repo.id} value={repo.id}>
                      <div className="flex items-center space-x-2">
                        <Github className="w-4 h-4 shrink-0" />
                        <span>{repo.name}</span>
                        {isPaused && (
                          <span className="text-xs text-amber-700 dark:text-amber-200 bg-amber-100 dark:bg-amber-500/20 px-2 py-1 rounded">
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

          <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="workspace" className="text-base font-semibold">
                  Slack Workspace
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {workspaces && workspaces.length > 0
                    ? `Connected to ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`
                    : "No workspaces connected yet"}
                </p>
              </div>
              <Button onClick={handleSlackConnect} variant="glow" className="text-white" size="default">
                <SiSlack className="w-4 h-4 mr-2" />
                {workspaces && workspaces.length > 0 ? "Add Another" : "Connect Workspace"}
              </Button>
            </div>
            {workspaces && workspaces.length > 0 && (
              <div className="p-3 bg-primary/10 border border-border rounded-md">
                <p className="text-xs text-foreground font-medium mb-1">💡 Connect a different Slack account?</p>
                <p className="text-xs text-muted-foreground">
                  To connect your work Slack (or another account), first{" "}
                  <a
                    href="https://slack.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium text-foreground hover:text-log-green"
                  >
                    log out of Slack
                  </a>{" "}
                  in your browser, then click &quot;Add Another&quot; above. Or use an incognito/private window.
                </p>
              </div>
            )}
            <div className="space-y-2">
              {workspacesLoading ? (
                <div className="text-sm text-muted-foreground">Loading workspaces...</div>
              ) : workspaces && workspaces.length > 0 ? (
                <Select
                  value={selectedWorkspace}
                  onValueChange={(value) => {
                    if (value === "__add_new__") {
                      handleSlackConnect();
                    } else {
                      setSelectedWorkspace(value);
                    }
                  }}
                >
                  <SelectTrigger id="workspace">
                    <SelectValue placeholder="Select a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>
                        <div className="flex items-center space-x-2">
                          <SiSlack className="w-4 h-4 shrink-0" />
                          <span>{ws.teamName}</span>
                        </div>
                      </SelectItem>
                    ))}
                    <div className="border-t my-1" />
                    <SelectItem value="__add_new__" className="text-log-green font-medium">
                      <div className="flex items-center space-x-2">
                        <SiSlack className="w-4 h-4 shrink-0" />
                        <span>+ Add Another Workspace</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-muted-foreground p-3 bg-card rounded-md border border-border">
                  No Slack workspaces connected. Click &quot;Connect Workspace&quot; above to add one.
                </div>
              )}
            </div>
          </div>

          {selectedWorkspace && (
            <div className="space-y-2">
              <Label htmlFor="channel">Slack Channel</Label>
              {channelsLoading ? (
                <div className="text-sm text-muted-foreground">Loading channels...</div>
              ) : channels && channels.length > 0 ? (
                <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                  <SelectTrigger id="channel">
                    <SelectValue placeholder="Select a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        <div className="flex items-center space-x-2">
                          <span>#{ch.name}</span>
                          {ch.is_private && <span className="text-xs text-muted-foreground">(private)</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-muted-foreground">No channels available</div>
              )}
            </div>
          )}

          {selectedChannel && channels && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">⚠️ Don&apos;t forget to invite PushLog</p>
              <p className="text-amber-700 dark:text-amber-300 text-xs">
                After creating the integration, run{" "}
                <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono text-xs">/invite @PushLog</code> in{" "}
                <strong>#{channels.find((c) => c.id === selectedChannel)?.name ?? "channel"}</strong> so the bot can send
                messages.
              </p>
            </div>
          )}

          <div className="space-y-4">
            <Label>Notification Settings</Label>
            <div className="space-y-2">
              <Label htmlFor="notification-level">Notification Level</Label>
              <Select value={notificationLevel} onValueChange={handleNotificationLevelChange}>
                <SelectTrigger id="notification-level">
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
                onCheckedChange={(checked) => setIncludeCommitSummaries(checked === true)}
              />
              <Label htmlFor="commit-summaries">Include AI commit summaries</Label>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateIntegration}
            disabled={
              !selectedRepository ||
              !selectedWorkspace ||
              !selectedChannel ||
              createIntegrationMutation.isPending
            }
            variant="glow"
            className="text-white"
          >
            {createIntegrationMutation.isPending ? "Creating..." : "Create Integration"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
