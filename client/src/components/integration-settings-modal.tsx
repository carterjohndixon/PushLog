import React, { useState } from "react";
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
import { Settings, Github} from "lucide-react";
import { SiSlack as SlackIcon } from "react-icons/si";
import { UseMutationResult } from "@tanstack/react-query";

const AI_MODELS = [
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'Advanced GPT-5 model with enhanced capabilities',
    costPerToken: 15
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    description: 'Improved GPT-5.1 with better performance',
    costPerToken: 20
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    description: 'Latest GPT-5.2 with cutting-edge features',
    costPerToken: 25
  },
  {
    id: 'gpt-5.2-codex',
    name: 'GPT-5.2-Codex',
    description: 'Specialized GPT-5.2-Codex optimized for code analysis',
    costPerToken: 30
  }
];

interface Integration {
  id: number;
  repositoryName: string;
  slackChannelName: string;
  notificationLevel: string;
  includeCommitSummaries: boolean;
  isActive?: boolean;
  aiModel?: string;
  maxTokens?: number;
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
  const [aiModel, setAiModel] = useState(integration?.aiModel || 'gpt-5.2-codex');
  const [maxTokens, setMaxTokens] = useState(integration?.maxTokens || 350);
  const [maxTokensInput, setMaxTokensInput] = useState(integration?.maxTokens?.toString() || '350');

  const handleSave = () => {
    if (!integration) return;

    updateIntegrationMutation.mutate({
      id: integration.id,
      updates: {
        isActive,
        notificationLevel,
        includeCommitSummaries,
        aiModel,
        maxTokens,
      },
    });
  };

  // Update local state when integration prop changes
  React.  useEffect(() => {
    if (integration) {
      setNotificationLevel(integration.notificationLevel || 'all');
      setIncludeCommitSummaries(integration.includeCommitSummaries ?? true);
      setIsActive(integration.isActive ?? true);
      setAiModel(integration.aiModel || 'gpt-5.2-codex');
      setMaxTokens(integration.maxTokens || 350);
      setMaxTokensInput(integration.maxTokens?.toString() || '350');
    }
  }, [integration]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
      if (integration) {
        setNotificationLevel(integration.notificationLevel || 'all');
        setIncludeCommitSummaries(integration.includeCommitSummaries ?? true);
        setIsActive(integration.isActive ?? true);
        setAiModel(integration.aiModel || 'gpt-5.2-codex');
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
            <Settings className="w-5 h-5 text-sky-blue" />
            <DialogTitle>Integration Settings</DialogTitle>
          </div>
          <DialogDescription>
            Configure how this integration sends notifications to Slack.
          </DialogDescription>
        </DialogHeader>
        
        {integration && (
          <div className="flex-1 overflow-y-auto space-y-6 px-1 py-2 pr-3">
            {/* Integration Info */}
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                  <Github className="text-white w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-graphite">{integration.repositoryName}</p> 
                  <p className="text-sm text-steel-gray">Repository</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-sky-blue rounded flex items-center justify-center">
                  <SlackIcon className="text-white w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-graphite">#{integration.slackChannelName}</p>
                  <p className="text-sm text-steel-gray">Slack Channel</p>
                </div>
              </div>
            </div>
            
            {/* Integration Status */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="integration-active">Integration Active</Label>
                <p className="text-xs text-steel-gray">
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
                <SelectTrigger>
                  <SelectValue placeholder="Select notification level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All pushes</SelectItem>
                  <SelectItem value="main_only">Main branch only</SelectItem>
                  <SelectItem value="tagged_only">Tagged releases only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-steel-gray">
                {notificationLevel === 'all' && 'Receive notifications for all pushes to any branch'}
                {notificationLevel === 'main_only' && 'Only receive notifications for pushes to the main branch'}
                {notificationLevel === 'tagged_only' && 'Only receive notifications for tagged releases'}
              </p>
            </div>

            {/* Include Commit Summaries */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="commit-summaries">Include Commit Summaries</Label>
                <p className="text-xs text-steel-gray">
                  Include commit messages and author information in notifications
                </p>
              </div>
              <Switch
                id="commit-summaries"
                checked={includeCommitSummaries}
                onCheckedChange={setIncludeCommitSummaries}
              />
            </div>

            {/* AI Model Selection */}
            <div className="space-y-2">
              <Label htmlFor="ai-model">AI Model</Label>
              <Select value={aiModel} onValueChange={setAiModel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select AI model" />
                </SelectTrigger>
                <SelectContent className="min-w-[var(--radix-select-trigger-width)] w-full max-w-md">
                  {AI_MODELS.map((model) => (
                    <SelectItem 
                      key={model.id} 
                      value={model.id} 
                      className="py-3 h-auto cursor-pointer"
                      textValue={model.name}
                    >
                      <div className="flex flex-col gap-1 w-full min-w-0 pr-4">
                        <span className="font-medium text-sm leading-tight">{model.name}</span>
                        <span className="text-xs text-steel-gray leading-relaxed break-words">
                          ${(model.costPerToken / 100).toFixed(3)}/1K tokens • {model.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-steel-gray">
                Choose the AI model for generating commit summaries. Higher-end models provide better analysis but cost more.
              </p>
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
                className="w-full"
              />
              <p className="text-xs text-steel-gray">
                Maximum number of tokens for AI responses (50-2000). Higher values allow for more detailed summaries but cost more.
              </p>
            </div>

            {/* Integration Status Indicator */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-graphite">Current Status</p>
                  <p className="text-xs text-steel-gray">
                    {isActive ? 'Integration is active and sending notifications' : 'Integration is paused and not sending notifications'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-log-green' : 'bg-steel-gray'}`} />
                  <span className="text-xs text-steel-gray">
                    {isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>
              {!isActive && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                  <p>⚠️ This integration is currently paused. Enable it above to start sending notifications to Slack.</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="flex-shrink-0 flex justify-end space-x-2 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => handleOpenChange(false)}
            disabled={updateIntegrationMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateIntegrationMutation.isPending}
            className="bg-sky-blue text-white hover:bg-blue-600"
          >
            {updateIntegrationMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
