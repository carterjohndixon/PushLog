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
import { Settings, Github, Key, Sparkles, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { getAiModelDisplayName } from "@/lib/utils";
import { SiSlack as SlackIcon } from "react-icons/si";
import { UseMutationResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

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

const OPENROUTER_PLACEHOLDER = "••••••••";

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
}

interface Integration {
  id: number;
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
  updateIntegrationMutation: UseMutationResult<any, Error, { id: number; updates: any }, unknown>;
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
  const [useOpenRouter, setUseOpenRouter] = useState(integration?.hasOpenRouterKey ?? false);
  const [aiModel, setAiModel] = useState(integration?.aiModel || 'gpt-5.2');
  const [openRouterApiKeyInput, setOpenRouterApiKeyInput] = useState("");
  const [openRouterVerified, setOpenRouterVerified] = useState(false);
  const [openRouterVerifyError, setOpenRouterVerifyError] = useState<string | null>(null);
  const [openRouterVerifying, setOpenRouterVerifying] = useState(false);
  const [maxTokens, setMaxTokens] = useState(integration?.maxTokens || 350);
  const [maxTokensInput, setMaxTokensInput] = useState(integration?.maxTokens?.toString() || '350');

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

  const canVerifyOpenRouterKey =
    useOpenRouter &&
    openRouterApiKeyInput.trim() !== "" &&
    openRouterApiKeyInput !== OPENROUTER_PLACEHOLDER;
  const isOpenRouterKeyVerified =
    openRouterVerified || (integration?.hasOpenRouterKey && openRouterApiKeyInput === OPENROUTER_PLACEHOLDER);

  async function handleVerifyOpenRouterKey() {
    if (!canVerifyOpenRouterKey) return;
    setOpenRouterVerifying(true);
    setOpenRouterVerifyError(null);
    try {
      const res = await fetch("/api/openrouter/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: openRouterApiKeyInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.valid) {
        setOpenRouterVerified(true);
        setOpenRouterVerifyError(null);
      } else {
        setOpenRouterVerified(false);
        setOpenRouterVerifyError(data.error || "Verification failed.");
      }
    } catch {
      setOpenRouterVerified(false);
      setOpenRouterVerifyError("Verification failed. Try again.");
    } finally {
      setOpenRouterVerifying(false);
    }
  }

  const handleSave = () => {
    if (!integration) return;

    const updates: Record<string, unknown> = {
      isActive,
      notificationLevel,
      includeCommitSummaries,
      aiModel,
      maxTokens,
    };
    if (useOpenRouter) {
      if (openRouterApiKeyInput && openRouterApiKeyInput !== OPENROUTER_PLACEHOLDER) {
        updates.openRouterApiKey = openRouterApiKeyInput;
      }
    } else {
      updates.openRouterApiKey = "";
    }

    updateIntegrationMutation.mutate({
      id: integration.id,
      updates,
    });
  };

  // Update local state when integration prop changes
  useEffect(() => {
    if (integration) {
      setNotificationLevel(integration.notificationLevel || 'all');
      setIncludeCommitSummaries(integration.includeCommitSummaries ?? true);
      setIsActive(integration.isActive ?? true);
      setUseOpenRouter(integration.hasOpenRouterKey ?? false);
      setAiModel(integration.aiModel || (integration.hasOpenRouterKey ? 'openai/gpt-4o' : 'gpt-4o'));
      setOpenRouterApiKeyInput(integration.hasOpenRouterKey ? OPENROUTER_PLACEHOLDER : '');
      setOpenRouterVerified(false);
      setOpenRouterVerifyError(null);
      setMaxTokens(integration.maxTokens || 350);
      setMaxTokensInput(integration.maxTokens?.toString() || '350');
    }
  }, [integration]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      if (integration) {
        setNotificationLevel(integration.notificationLevel || 'all');
        setIncludeCommitSummaries(integration.includeCommitSummaries ?? true);
        setIsActive(integration.isActive ?? true);
        setUseOpenRouter(integration.hasOpenRouterKey ?? false);
        setAiModel(integration.aiModel || 'gpt-4o');
        setOpenRouterApiKeyInput(integration.hasOpenRouterKey ? OPENROUTER_PLACEHOLDER : '');
        setOpenRouterVerified(false);
        setOpenRouterVerifyError(null);
        setMaxTokens(integration.maxTokens || 350);
        setMaxTokensInput(integration.maxTokens?.toString() || '350');
      }
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
                <SelectContent className="bg-popover border-border">
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
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>AI for commit summaries</Label>
                  <p className="text-xs text-muted-foreground">
                    Use PushLog&apos;s models (uses your credits) or your own OpenRouter API key (you pay OpenRouter).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">PushLog</span>
                  <Switch
                    checked={useOpenRouter}
                    onCheckedChange={(checked) => {
                      setUseOpenRouter(checked);
                      if (checked && !aiModel.includes("/")) {
                        setAiModel(openRouterModels[0]?.id ?? "openai/gpt-4o");
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Key className="w-3 h-3" /> OpenRouter
                  </span>
                </div>
              </div>

              {!useOpenRouter ? (
                /* PushLog: built-in model dropdown */
                <div className="space-y-2">
                  <Label htmlFor="ai-model">PushLog AI Model</Label>
                  <Select value={aiModel} onValueChange={setAiModel}>
                    <SelectTrigger className="w-full bg-background text-foreground border-border">
                      <SelectValue placeholder="Select AI model">
                        {aiModel ? getAiModelDisplayName(aiModel) : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="min-w-[var(--radix-select-trigger-width)] w-full max-w-md bg-popover border-border">
                      {AI_MODELS.map((model) => (
                        <SelectItem
                          key={model.id}
                          value={model.id}
                          className="py-3 h-auto cursor-pointer"
                          textValue={model.name}
                        >
                          <div className="flex flex-col gap-1 w-full min-w-0 pr-4">
                            <span className="font-medium text-sm leading-tight">{model.name}</span>
                            <span className="text-xs text-muted-foreground leading-relaxed break-words">
                              ${(model.costPerToken / 100).toFixed(3)}/1K tokens • {model.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                /* OpenRouter: API key → verify → model choice */
                <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/30">
                  <div className="space-y-2">
                    <Label htmlFor="openrouter-key" className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-log-green" /> OpenRouter API key
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="openrouter-key"
                        type="password"
                        placeholder="sk-or-v1-..."
                        value={openRouterApiKeyInput}
                        onChange={(e) => {
                          setOpenRouterApiKeyInput(e.target.value);
                          if (e.target.value !== OPENROUTER_PLACEHOLDER) setOpenRouterVerified(false);
                          setOpenRouterVerifyError(null);
                        }}
                        className="font-mono bg-background text-foreground border-border flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canVerifyOpenRouterKey || openRouterVerifying}
                        onClick={handleVerifyOpenRouterKey}
                        className="shrink-0 border-border"
                      >
                        {openRouterVerifying ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isOpenRouterKeyVerified ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" aria-label="Key verified" />
                        ) : (
                          "Verify"
                        )}
                      </Button>
                    </div>
                    {isOpenRouterKeyVerified && (
                      <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> API key verified. You can select a model below.
                      </p>
                    )}
                    {openRouterVerifyError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 shrink-0" /> {openRouterVerifyError}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Get a key at{" "}
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-log-green hover:underline"
                      >
                        openrouter.ai/keys
                      </a>
                      . Verify your key, then choose a model. Leave key blank to keep your existing key.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="openrouter-model" className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-log-green" /> Model
                    </Label>
                    <Select
                      value={openRouterModels.some((m) => m.id === aiModel) ? aiModel : (openRouterModels[0]?.id ?? aiModel ?? '')}
                      onValueChange={(v) => setAiModel(v)}
                      disabled={!isOpenRouterKeyVerified}
                    >
                      <SelectTrigger
                        id="openrouter-model"
                        className="w-full bg-background text-foreground border-border disabled:opacity-60"
                      >
                        <SelectValue
                          placeholder={
                            !isOpenRouterKeyVerified
                              ? "Verify your API key first"
                              : openRouterModels.length
                                ? "Select model"
                                : "Loading models…"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px] bg-popover border-border">
                        {openRouterModels.map((model) => (
                          <SelectItem
                            key={model.id}
                            value={model.id}
                            className="py-2 cursor-pointer"
                            textValue={model.name}
                          >
                            <span className="font-medium text-sm">{model.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">({model.id})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
              (useOpenRouter && canVerifyOpenRouterKey && !isOpenRouterKeyVerified)
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
