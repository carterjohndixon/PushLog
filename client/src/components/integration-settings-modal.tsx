import React, { useState, useEffect } from "react";
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
import { Settings, Github, Key, Sparkles } from "lucide-react";
import { getAiModelDisplayName } from "@/lib/utils";
import { SiSlack as SlackIcon } from "react-icons/si";
import { UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { Send } from "lucide-react";

const AI_MODELS = [
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    description: 'Latest GPT-5.2 model with cutting-edge features (Latest & Recommended)',
    costPerToken: 25
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    description: 'Improved GPT-5.1 with better performance',
    costPerToken: 20
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Most advanced GPT-4 model with improved performance and lower cost',
    costPerToken: 5
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Faster and more affordable GPT-4o variant',
    costPerToken: 3
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'GPT-4 Turbo with extended context window',
    costPerToken: 10
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    description: 'Original GPT-4 model for complex analysis',
    costPerToken: 30
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'Fast and cost-effective for most use cases',
    costPerToken: 1
  }
];

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
}

interface Integration {
  id: string;
  repositoryName: string;
  slackChannelName: string;
  notificationLevel: string;
  includeCommitSummaries: boolean;
  isActive?: boolean;
  aiModel?: string;
  maxTokens?: number;
  hasOpenRouterKey?: boolean;
}

interface IntegrationSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: Integration | null;
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
  const [useOpenRouter, setUseOpenRouter] = useState(!!(integration?.aiModel?.includes("/") || integration?.hasOpenRouterKey));
  const [aiModel, setAiModel] = useState(integration?.aiModel || 'gpt-5.2');
  const [maxTokens, setMaxTokens] = useState(integration?.maxTokens || 350);
  const [maxTokensInput, setMaxTokensInput] = useState(integration?.maxTokens?.toString() || '350');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const testSlackMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const res = await apiRequest("POST", `/api/integrations/${integrationId}/test-slack`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test sent", description: "Check your Slack channel for the test message." });
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

  const handleSave = () => {
    if (!integration) return;

    const updates: Record<string, unknown> = {
      isActive,
      notificationLevel,
      includeCommitSummaries,
      aiModel,
      maxTokens,
    };
    if (!useOpenRouter) {
      updates.openRouterApiKey = "";
    }

    updateIntegrationMutation.mutate({
      id: integration.id,
      updates,
    });
  };

  useEffect(() => {
    if (integration) {
      setNotificationLevel(integration.notificationLevel || 'all');
      setIncludeCommitSummaries(integration.includeCommitSummaries ?? true);
      setIsActive(integration.isActive ?? true);
      setUseOpenRouter(!!(integration.aiModel?.includes("/") || integration.hasOpenRouterKey));
      setAiModel(integration.aiModel || 'gpt-4o');
      setMaxTokens(integration.maxTokens || 350);
      setMaxTokensInput(integration.maxTokens?.toString() || '350');
    }
  }, [integration]);

  const baseUseOpenRouter = !!(integration?.aiModel?.includes("/") || integration?.hasOpenRouterKey);
  const baseAiModel = integration?.aiModel || "gpt-4o";
  const hasChanges = !!integration && (
    isActive !== (integration.isActive ?? true) ||
    notificationLevel !== (integration.notificationLevel || "all") ||
    includeCommitSummaries !== (integration.includeCommitSummaries ?? true) ||
    useOpenRouter !== baseUseOpenRouter ||
    aiModel !== baseAiModel ||
    maxTokens !== (integration.maxTokens ?? 350)
  );

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && integration) {
      setNotificationLevel(integration.notificationLevel || 'all');
      setIncludeCommitSummaries(integration.includeCommitSummaries ?? true);
      setIsActive(integration.isActive ?? true);
      setUseOpenRouter(!!(integration.aiModel?.includes("/") || integration.hasOpenRouterKey));
      setAiModel(integration.aiModel || 'gpt-4o');
      setMaxTokens(integration.maxTokens || 350);
      setMaxTokensInput(integration.maxTokens?.toString() || '350');
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
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-log-green rounded flex items-center justify-center">
                  <SlackIcon className="text-white w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">#{integration.slackChannelName}</p>
                  <p className="text-sm text-muted-foreground">Slack Channel</p>
                </div>
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
                onCheckedChange={setIsActive}
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

            {/* AI provider: PushLog vs OpenRouter */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-6">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <Label>AI for commit summaries</Label>
                  <p className="text-xs text-muted-foreground">
                    Use PushLog&apos;s models (uses your credits) or your own OpenRouter API key (you pay OpenRouter).
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <Switch
                    checked={useOpenRouter}
                    onCheckedChange={(checked) => {
                      setUseOpenRouter(checked);
                      if (!checked && aiModel.includes("/")) {
                        setAiModel("gpt-5.2");
                      }
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
                  <Select value={aiModel} onValueChange={setAiModel}>
                    <SelectTrigger className="w-full bg-background text-foreground border-border">
                      <SelectValue placeholder="Select AI model">
                        {aiModel ? getAiModelDisplayName(aiModel) : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-w-[var(--radix-select-trigger-width)] bg-popover border-border text-foreground" position="popper">
                      {AI_MODELS.map((model) => (
                        <SelectItem
                          key={model.id}
                          value={model.id}
                          className="py-3 h-auto cursor-pointer group data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground"
                          textValue={model.name}
                        >
                          <div className="flex flex-col gap-1 w-full min-w-0 pr-4">
                            <span className="font-medium text-sm leading-tight text-foreground group-data-[highlighted]:text-primary-foreground">{model.name}</span>
                            <span className="text-xs text-foreground/90 leading-relaxed break-words group-data-[highlighted]:text-primary-foreground">
                              ${(model.costPerToken / 100).toFixed(3)}/1K tokens • {model.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                /* OpenRouter: key is managed on Models page; here we only show model choice if user has key */
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
                      <p className="text-xs text-muted-foreground">
                        Browse and compare models on the <Link href="/models" className="text-log-green hover:underline">Models</Link> page.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

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
                Maximum number of tokens for AI responses (50-2000). Higher values allow for more detailed summaries but cost more.
              </p>
            </div>

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
