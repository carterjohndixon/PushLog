import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Settings, Github, Key, Sparkles, Lock, ChevronDown, ChevronRight, Send } from "lucide-react";
import { getAiModelDisplayName } from "@/lib/utils";
import { SiSlack as SlackIcon } from "react-icons/si";
import { UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import type { ActiveIntegration } from "@/lib/types";

type PushlogMode = "clean_summary" | "slack_friendly" | "detailed_engineering" | "executive_summary" | "incident_aware";

const PUSHLOG_MODE_OPTIONS: { mode: PushlogMode; label: string; requiredPlan: "free" | "pro" | "team" }[] = [
  { mode: "clean_summary", label: "Clean Summary", requiredPlan: "free" },
  { mode: "slack_friendly", label: "Slack-Friendly", requiredPlan: "pro" },
  { mode: "detailed_engineering", label: "Detailed Engineering", requiredPlan: "pro" },
  { mode: "executive_summary", label: "Executive Summary", requiredPlan: "pro" },
  { mode: "incident_aware", label: "Incident-Aware", requiredPlan: "team" },
];

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, team: 2 };

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

interface SlackWorkspace {
  id: string;
  teamId: string;
  teamName: string;
}

interface IntegrationSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: ActiveIntegration | null;
  updateIntegrationMutation: UseMutationResult<any, Error, { id: string; updates: any }, unknown>;
}

export function IntegrationSettingsModal({
  open,
  onOpenChange,
  integration,
  updateIntegrationMutation,
}: IntegrationSettingsModalProps) {
  const [notificationLevel, setNotificationLevel] = useState(integration?.notificationLevel || 'all');
  const [includeCommitSummaries, setIncludeCommitSummaries] = useState(integration?.includeCommitSummaries ?? true);
  const [isActive, setIsActive] = useState(integration?.isActive ?? true);
  const [pushlogMode, setPushlogMode] = useState<PushlogMode>(((integration as any)?.pushlogMode || "clean_summary") as PushlogMode);
  const [useOpenRouter, setUseOpenRouter] = useState(!!(integration?.aiModel?.includes("/") || integration?.hasOpenRouterKey));
  const [aiModel, setAiModel] = useState(integration?.aiModel || 'gpt-5.2');
  const [maxTokens, setMaxTokens] = useState(integration?.maxTokens || 350);
  const [maxTokensInput, setMaxTokensInput] = useState(integration?.maxTokens?.toString() || '350');
  const [selectedSlackChannelId, setSelectedSlackChannelId] = useState(integration?.slackChannelId ?? '');
  const [relinkWorkspaceId, setRelinkWorkspaceId] = useState<string>("");
  const [relinkChannelId, setRelinkChannelId] = useState<string>("");
  const [advancedAiOpen, setAdvancedAiOpen] = useState(false);
  const lastOpenRouterModelRef = useRef<string | null>(null);
  const { toast } = useToast();

  const { data: slackWorkspaces = [] } = useQuery<SlackWorkspace[]>({
    queryKey: ["/api/slack/workspaces"],
    queryFn: async () => {
      const res = await fetch("/api/slack/workspaces", { credentials: "include", headers: { Accept: "application/json" } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const wsStillConnected = !!integration?.slackWorkspaceId && slackWorkspaces.some((ws) => ws.id === integration.slackWorkspaceId);
  const workspaceIdForChannels = (wsStillConnected ? integration?.slackWorkspaceId : null) || relinkWorkspaceId || null;
  const { data: slackChannels = [], isLoading: slackChannelsLoading } = useQuery<SlackChannel[]>({
    queryKey: ["/api/slack/workspaces", workspaceIdForChannels, "channels"],
    queryFn: async () => {
      if (!workspaceIdForChannels) return [];
      const res = await fetch(`/api/slack/workspaces/${workspaceIdForChannels}/channels`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Failed to fetch channels");
      return res.json();
    },
    enabled: open && !!workspaceIdForChannels,
  });

  const queryClient = useQueryClient();

  const handleSlackConnect = async () => {
    try {
      const response = await fetch("/api/slack/connect?popup=true", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to connect Slack");
      if (data.url) {
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        const popup = window.open(
          data.url,
          "slack-oauth",
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
        );
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            queryClient.invalidateQueries({ queryKey: ["/api/slack/workspaces"] });
          }
        }, 500);
        window.addEventListener("message", (event) => {
          if (event.origin !== window.location.origin || event.data !== "slack-connected") return;
          queryClient.invalidateQueries({ queryKey: ["/api/slack/workspaces"] });
          if (popup) popup.close();
        });
      }
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Slack. Please try again.",
        variant: "destructive",
      });
    }
  };

  const testSlackMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const res = await apiRequest("POST", `/api/integrations/${integrationId}/test-slack`);
      return res.json();
    },
    onError: (err: any) => {
      toast({
        title: "Test failed",
        description: err?.message || "Could not send test message to Slack.",
        variant: "destructive",
      });
    },
  });

  const { data: profileResponse } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    enabled: open,
  });
  const userHasOpenRouterKey = !!profileResponse?.user?.hasOpenRouterKey;
  const preferredAiModel = (profileResponse?.user as { preferredAiModel?: string } | undefined)?.preferredAiModel;

  const { data: openRouterData } = useQuery<{ models: OpenRouterModel[] }>({
    queryKey: ["/api/openrouter/models"],
    queryFn: async () => {
      const res = await fetch("/api/openrouter/models", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json();
    },
    enabled: open && useOpenRouter,
  });
  const openRouterModels = openRouterData?.models ?? [];

  const { data: openaiModelsData } = useQuery<{ models: { id: string; name?: string }[] }>({
    queryKey: ["/api/openai/models"],
    queryFn: async () => {
      const res = await fetch("/api/openai/models", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch OpenAI models");
      return res.json();
    },
    enabled: open && !useOpenRouter,
  });
  const openaiModelsFromApi = openaiModelsData?.models ?? [];
  const openaiOptions = (() => {
    const list = [...openaiModelsFromApi];
    if (aiModel && !list.some((m) => m.id === aiModel)) {
      list.push({ id: aiModel, name: getAiModelDisplayName(aiModel) || aiModel });
    }
    return list;
  })();

  const handleSave = () => {
    if (!integration) return;

    const hasSlack = integration.slackWorkspaceId && integration.slackChannelId;
    const workspaceConnected = hasSlack && slackWorkspaces.some((ws) => ws.id === integration.slackWorkspaceId);
    const needsRelink = !hasSlack || !workspaceConnected;
    const canRelink = needsRelink && relinkWorkspaceId && relinkChannelId;

    if (isActive && needsRelink && !canRelink) {
      toast({
        title: "Cannot unpause",
        description: hasSlack && !workspaceConnected
          ? "The Slack workspace for this integration is no longer connected. Reconnect it in Settings or below, then try again."
          : slackWorkspaces.length > 0
            ? "Select a workspace and channel below to re-link this integration, then click Save. You can then unpause."
            : "Connect a Slack workspace first, then re-link this integration to unpause.",
        variant: "destructive",
      });
      return;
    }

    const updates: Record<string, unknown> = {
      isActive,
      notificationLevel,
      includeCommitSummaries,
      pushlogMode,
      aiModel,
      maxTokens,
    };
    if (!useOpenRouter) {
      updates.openRouterApiKey = "";
    }
    if (workspaceConnected && selectedSlackChannelId && selectedSlackChannelId !== (integration.slackChannelId ?? '')) {
      const channelName = slackChannels.find((c) => c.id === selectedSlackChannelId)?.name ?? integration.slackChannelName ?? selectedSlackChannelId;
      updates.slackChannelId = selectedSlackChannelId;
      updates.slackChannelName = channelName;
    }
    if (canRelink) {
      const channelName = slackChannels.find((c) => c.id === relinkChannelId)?.name ?? "channel";
      updates.slackWorkspaceId = relinkWorkspaceId;
      updates.slackChannelId = relinkChannelId;
      updates.slackChannelName = channelName;
    }

    const id = integration?.id != null ? String(integration.id) : "";
    if (!id || id === "NaN") {
      toast({
        title: "Cannot save",
        description: "Invalid integration. Please close and open the integration again.",
        variant: "destructive",
      });
      return;
    }
    updateIntegrationMutation.mutate({
      id,
      updates,
    });
  };

  const [prevIntegrationId, setPrevIntegrationId] = useState(integration?.id);
  if (integration?.id !== prevIntegrationId) {
    setPrevIntegrationId(integration?.id);
    lastOpenRouterModelRef.current = null;
    if (integration) {
      setNotificationLevel(integration.notificationLevel || 'all');
      setIncludeCommitSummaries(integration.includeCommitSummaries ?? true);
      setIsActive(integration.isActive ?? true);
      setPushlogMode(((integration as any)?.pushlogMode || "clean_summary") as PushlogMode);
      setUseOpenRouter(!!(integration.aiModel?.includes("/") || integration.hasOpenRouterKey));
      setAiModel(integration.aiModel || 'gpt-5.2');
      setMaxTokens(integration.maxTokens || 350);
      setMaxTokensInput(integration.maxTokens?.toString() || '350');
      setSelectedSlackChannelId(integration.slackChannelId ?? '');
      setRelinkWorkspaceId("");
      setRelinkChannelId("");
    }
  }

  const baseUseOpenRouter = !!(integration?.aiModel?.includes("/") || integration?.hasOpenRouterKey);
  const baseAiModel = integration?.aiModel || "gpt-5.2";
  const basePushlogMode = ((integration as any)?.pushlogMode || "clean_summary") as PushlogMode;
  const hasChanges = !!integration && (
    isActive !== (integration.isActive ?? true) ||
    notificationLevel !== (integration.notificationLevel || "all") ||
    includeCommitSummaries !== (integration.includeCommitSummaries ?? true) ||
    pushlogMode !== basePushlogMode ||
    useOpenRouter !== baseUseOpenRouter ||
    aiModel !== baseAiModel ||
    maxTokens !== (integration.maxTokens ?? 350) ||
    (wsStillConnected && selectedSlackChannelId !== (integration.slackChannelId ?? '')) ||
    !!(relinkWorkspaceId && relinkChannelId)
  );

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && integration) {
      setNotificationLevel(integration.notificationLevel || 'all');
      setIncludeCommitSummaries(integration.includeCommitSummaries ?? true);
      setIsActive(integration.isActive ?? true);
      setPushlogMode(((integration as any)?.pushlogMode || "clean_summary") as PushlogMode);
      setUseOpenRouter(!!(integration.aiModel?.includes("/") || integration.hasOpenRouterKey));
      setAiModel(integration.aiModel || 'gpt-5.2');
      setMaxTokens(integration.maxTokens || 350);
      setMaxTokensInput(integration.maxTokens?.toString() || '350');
      setSelectedSlackChannelId(integration.slackChannelId ?? '');
      setRelinkWorkspaceId("");
      setRelinkChannelId("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-log-green" />
            <DialogTitle>Integration Settings</DialogTitle>
          </div>
          <DialogDescription>
            Configure how this integration sends notifications to Slack.
          </DialogDescription>
        </DialogHeader>
        
        {integration && (
          <div className="flex-1 overflow-y-auto space-y-6 px-1 py-2 pr-3">
            {/* Integration Info */}
            <div className="p-4 bg-muted rounded-lg border border-border space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-secondary rounded flex items-center justify-center">
                  <Github className="text-foreground w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{integration.repositoryName}</p> 
                  <p className="text-sm text-muted-foreground">Repository</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="w-8 h-8 bg-log-green rounded flex items-center justify-center shrink-0">
                  <SlackIcon className="text-white w-4 h-4" />
                </div>
                {(() => {
                  const wsConnected = !!integration.slackWorkspaceId && slackWorkspaces.some((ws) => ws.id === integration.slackWorkspaceId);
                  const needsRelink = !integration.slackWorkspaceId || !wsConnected;

                  return (
                <div className="min-w-0 flex-1 space-y-1">
                  <Label className="text-sm text-muted-foreground">Slack Channel</Label>
                  {!needsRelink ? (
                    <Select
                      value={selectedSlackChannelId || undefined}
                      onValueChange={(v) => setSelectedSlackChannelId(v || '')}
                      disabled={slackChannelsLoading}
                    >
                      <SelectTrigger className="bg-background text-foreground border-border w-full">
                        <SelectValue placeholder={slackChannelsLoading ? "Loading channels…" : "Select channel"} />
                      </SelectTrigger>
                      <SelectContent className="max-w-[var(--radix-select-trigger-width)] bg-popover border-border" position="popper">
                        {(() => {
                          const hasCurrent = integration.slackChannelId && slackChannels.some((c) => c.id === integration.slackChannelId);
                          const options = hasCurrent || !integration.slackChannelId
                            ? slackChannels
                            : [{ id: integration.slackChannelId, name: integration.slackChannelName || "Current channel", is_private: false }, ...slackChannels];
                          return options.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id} className="capitalize">
                              #{ch.name}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  ) : slackWorkspaces.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {integration.slackWorkspaceId
                          ? "The Slack workspace for this integration was disconnected. Select a workspace and channel to re-link it."
                          : "This integration was disconnected. Select a workspace and channel to re-link it."}
                      </p>
                      <Select value={relinkWorkspaceId || undefined} onValueChange={(v) => { setRelinkWorkspaceId(v || ""); setRelinkChannelId(""); }}>
                        <SelectTrigger className="bg-background text-foreground border-border w-full">
                          <SelectValue placeholder="Select workspace" />
                        </SelectTrigger>
                        <SelectContent className="max-w-[var(--radix-select-trigger-width)] bg-popover border-border" position="popper">
                          {slackWorkspaces.map((ws) => (
                            <SelectItem key={ws.id} value={ws.id}>{ws.teamName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={relinkChannelId || undefined}
                        onValueChange={(v) => setRelinkChannelId(v || '')}
                        disabled={!relinkWorkspaceId || slackChannelsLoading}
                      >
                        <SelectTrigger className="bg-background text-foreground border-border w-full">
                          <SelectValue placeholder={relinkWorkspaceId && slackChannelsLoading ? "Loading channels…" : "Select channel"} />
                        </SelectTrigger>
                        <SelectContent className="max-w-[var(--radix-select-trigger-width)] bg-popover border-border" position="popper">
                          {slackChannels.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id} className="capitalize">#{ch.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        No Slack workspace connected. Connect one to re-link this integration.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-log-green text-log-green hover:bg-log-green/10"
                        onClick={handleSlackConnect}
                      >
                        <SlackIcon className="w-4 h-4 mr-2" />
                        Connect Slack Workspace
                      </Button>
                    </div>
                  )}
                  {!needsRelink && (
                    <p className="text-xs text-muted-foreground">Change which channel receives notifications.</p>
                  )}
                </div>
                  );
                })()}
              </div>
            </div>
            
            {/* Integration Status */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="integration-active">Integration Active</Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable this integration. When disabled, no notifications will be sent to Slack.
                </p>
              </div>
              <Switch
                id="integration-active"
                checked={isActive}
                onCheckedChange={(checked) => {
                  if (checked && integration) {
                    const hasIds = integration.slackWorkspaceId && integration.slackChannelId;
                    const workspaceConnected = hasIds && slackWorkspaces.some((ws) => ws.id === integration.slackWorkspaceId);
                    const hasRelink = relinkWorkspaceId && relinkChannelId;

                    if (!hasIds && !hasRelink) {
                      toast({
                        title: "Cannot unpause",
                        description: slackWorkspaces.length > 0
                          ? "Select a workspace and channel above to re-link this integration, then click Save. You can then unpause."
                          : "Connect a Slack workspace first, then re-link this integration to unpause.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (hasIds && !workspaceConnected && !hasRelink) {
                      toast({
                        title: "Cannot unpause",
                        description: "The Slack workspace for this integration is no longer connected. Reconnect it below or in Settings, then try again.",
                        variant: "destructive",
                      });
                      return;
                    }
                  }
                  setIsActive(checked);
                }}
              />
            </div>
            
            {/* Notification Level */}
            <div className="space-y-2">
              <Label htmlFor="notification-level">Notification Level</Label>
              <Select value={notificationLevel} onValueChange={setNotificationLevel}>
                <SelectTrigger className="bg-background text-foreground border-border">
                  <SelectValue placeholder="Select notification level" />
                </SelectTrigger>
                <SelectContent className="max-w-[var(--radix-select-trigger-width)] bg-popover border-border" position="popper">
                  <SelectItem value="all">All pushes</SelectItem>
                  <SelectItem value="main_only">Main branch only</SelectItem>
                  <SelectItem value="tagged_only">Tagged releases only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {notificationLevel === 'all' && 'Receive notifications for all pushes to any branch'}
                {notificationLevel === 'main_only' && 'Only receive notifications for pushes to the main branch'}
                {notificationLevel === 'tagged_only' && 'Only receive notifications for tagged releases'}
              </p>
            </div>

            {/* Include Commit Summaries */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="commit-summaries">Include Commit Summaries</Label>
                <p className="text-xs text-muted-foreground">
                  Include commit messages and author information in notifications
                </p>
              </div>
              <Switch
                id="commit-summaries"
                checked={includeCommitSummaries}
                onCheckedChange={setIncludeCommitSummaries}
              />
            </div>

            {/* PushLog Summary Mode */}
            <div className="space-y-2">
              <Label htmlFor="pushlog-mode">Summary Mode</Label>
              <Select value={pushlogMode} onValueChange={(v) => setPushlogMode(v as PushlogMode)}>
                <SelectTrigger className="bg-background text-foreground border-border">
                  <SelectValue placeholder="Select summary mode" />
                </SelectTrigger>
                <SelectContent className="max-w-[var(--radix-select-trigger-width)] bg-popover border-border" position="popper">
                  {PUSHLOG_MODE_OPTIONS.map((opt) => {
                    const userPlan = profileResponse?.user?.plan ?? "free";
                    const accessible = (PLAN_RANK[userPlan] ?? 0) >= (PLAN_RANK[opt.requiredPlan] ?? 0);
                    return (
                      <SelectItem key={opt.mode} value={opt.mode} disabled={!accessible}>
                        <span className="flex items-center gap-2">
                          {opt.label}
                          {!accessible && <Lock className="w-3 h-3 text-muted-foreground" />}
                          {opt.requiredPlan !== "free" && (
                            <Badge variant="outline" className="text-[10px] capitalize px-1 py-0">{opt.requiredPlan}</Badge>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Controls how PushLog summarizes commits for this integration.
              </p>
            </div>

            {/* Advanced AI Settings (collapsible) */}
            <Collapsible open={advancedAiOpen} onOpenChange={setAdvancedAiOpen}>
              <button
                type="button"
                onClick={() => setAdvancedAiOpen(!advancedAiOpen)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                Advanced AI Settings
                {advancedAiOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              <CollapsibleContent>
                <div className="space-y-4 mt-3">
                  <div className="flex items-center justify-between gap-6">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <Label>AI Provider</Label>
                      <p className="text-xs text-muted-foreground">
                        Use PushLog&apos;s models (uses your credits) or your own OpenRouter API key.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Switch
                        checked={useOpenRouter}
                        onCheckedChange={(checked) => {
                          if (!checked) {
                            if (aiModel.includes("/")) {
                              lastOpenRouterModelRef.current = aiModel;
                            }
                            const fallback = preferredAiModel && !String(preferredAiModel).includes("/") ? preferredAiModel : "gpt-5.2";
                            setAiModel(fallback);
                          } else {
                            if (lastOpenRouterModelRef.current) {
                              setAiModel(lastOpenRouterModelRef.current);
                              lastOpenRouterModelRef.current = null;
                            }
                          }
                          setUseOpenRouter(checked);
                        }}
                      />
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Key className="w-3 h-3" /> OpenRouter
                      </span>
                    </div>
                  </div>

                  {!useOpenRouter ? (
                    <div className="space-y-2">
                      <Label htmlFor="ai-model">PushLog AI Model</Label>
                      <Select
                        value={openaiOptions.some((m) => m.id === aiModel) ? aiModel : (openaiOptions[0]?.id ?? "")}
                        onValueChange={setAiModel}
                      >
                        <SelectTrigger className="w-full bg-background text-foreground border-border">
                          <SelectValue placeholder={openaiOptions.length ? "Select AI model" : "Loading models…"}>
                            {aiModel ? getAiModelDisplayName(aiModel) : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-h-[280px] max-w-[var(--radix-select-trigger-width)] bg-popover border-border text-foreground" position="popper">
                          {openaiOptions.map((model) => {
                            const displayName = model.name || getAiModelDisplayName(model.id) || model.id;
                            return (
                              <SelectItem
                                key={model.id}
                                value={model.id}
                                className="py-2 cursor-pointer min-w-0 group data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground"
                                textValue={displayName}
                              >
                                <span className="flex items-center min-w-0 gap-2 overflow-hidden w-full">
                                  <span className="font-medium text-sm truncate min-w-0 flex-1">{displayName}</span>
                                  <span className="text-muted-foreground group-data-[highlighted]:text-primary-foreground text-xs truncate">({model.id})</span>
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/30">
                      {!userHasOpenRouterKey ? (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            Add your OpenRouter API key on the <strong className="text-foreground">Models</strong> page to use OpenRouter models here.
                          </p>
                          <Link href="/models">
                            <Button type="button" variant="outline" size="sm" className="border-log-green text-log-green hover:bg-log-green/10">
                              <Key className="w-4 h-4 mr-2" />
                              Go to Models
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label htmlFor="openrouter-model" className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-log-green" /> Model
                          </Label>
                          <Select
                            value={openRouterModels.some((m) => m.id === aiModel) ? aiModel : ""}
                            onValueChange={(v) => setAiModel(v)}
                          >
                            <SelectTrigger
                              id="openrouter-model"
                              className="w-full bg-background text-foreground border-border"
                            >
                              <SelectValue
                                placeholder={openRouterModels.length ? "Select model" : "Loading models…"}
                              />
                            </SelectTrigger>
                            <SelectContent
                              className="max-h-[280px] max-w-[var(--radix-select-trigger-width)] bg-popover border-border"
                              position="popper"
                            >
                              {openRouterModels.map((model) => (
                                <SelectItem
                                  key={model.id}
                                  value={model.id}
                                  className="py-2 cursor-pointer min-w-0 group"
                                  textValue={`${model.name} (${model.id})`}
                                >
                                  <span className="flex items-center min-w-0 gap-2 overflow-hidden w-full">
                                    <span className="font-medium text-sm truncate min-w-0 flex-1">{model.name}</span>
                                    <span className="text-muted-foreground group-data-[highlighted]:text-accent-foreground text-xs truncate min-w-0">({model.id})</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Max Tokens */}
                  <div className="space-y-2">
                    <Label htmlFor="max-tokens">Max Response Length</Label>
                    <Input
                      id="max-tokens"
                      type="number"
                      min="50"
                      max="2000"
                      value={maxTokensInput}
                      onChange={(e) => {
                        setMaxTokensInput(e.target.value);
                      }}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value === '' || parseInt(value) < 50) {
                          setMaxTokens(350);
                          setMaxTokensInput('350');
                        } else if (parseInt(value) > 2000) {
                          setMaxTokens(2000);
                          setMaxTokensInput('2000');
                        } else {
                          const numValue = parseInt(value);
                          if (!isNaN(numValue)) {
                            setMaxTokens(numValue);
                          }
                        }
                      }}
                      className="w-full bg-background text-foreground border-border"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum number of tokens for AI responses (50-2000).
                    </p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Integration Status Indicator */}
            <div className="p-3 bg-muted rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">Current Status</p>
                  <p className="text-xs text-muted-foreground">
                    {isActive ? 'Integration is active and sending notifications' : 'Integration is paused and not sending notifications'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-log-green' : 'bg-muted-foreground'}`} />
                  <span className="text-xs text-muted-foreground">
                    {isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>
              {!isActive && (
                <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-800 dark:text-amber-200">
                  <p>⚠️ This integration is currently paused. Enable it above to start sending notifications to Slack.</p>
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full border-border"
                  disabled={testSlackMutation.isPending}
                  onClick={() => integration && testSlackMutation.mutate(integration.id)}
                >
                  <Send className="w-3.5 h-3.5 mr-2" />
                  {testSlackMutation.isPending ? "Sending…" : "Send test message to Slack"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Sends a test message to #{integration?.slackChannelName}. If it fails, reconnect Slack or invite the app to the channel.
                </p>
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-800 dark:text-amber-200">
                  <p>
                    💡 Not receiving messages? Run{" "}
                    <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">/invite @PushLog</code>{" "}
                    in <strong>#{integration?.slackChannelName}</strong> to let the bot post.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-shrink-0 flex justify-end space-x-2 pt-4 border-t border-border">
          <Button 
            variant="outline" 
            onClick={() => handleOpenChange(false)}
            disabled={updateIntegrationMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              updateIntegrationMutation.isPending ||
              !hasChanges ||
              (useOpenRouter && !userHasOpenRouterKey) ||
              (useOpenRouter && userHasOpenRouterKey && !openRouterModels.some((m) => m.id === aiModel))
            }
            variant="glow"
            className="text-white"
          >
            {updateIntegrationMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
