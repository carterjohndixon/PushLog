import { useState } from "react";
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
import { Settings, Github} from "lucide-react";
import { SiSlack as SlackIcon } from "react-icons/si";
import { UseMutationResult } from "@tanstack/react-query";

interface Integration {
  id: number;
  repositoryName: string;
  slackChannelName: string;
  notificationLevel: string;
  includeCommitSummaries: boolean;
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

  const handleSave = () => {
    if (!integration) return;

    updateIntegrationMutation.mutate({
      id: integration.id,
      updates: {
        notificationLevel,
        includeCommitSummaries,
      },
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
      setNotificationLevel(integration?.notificationLevel || 'all');
      setIncludeCommitSummaries(integration?.includeCommitSummaries ?? true);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-sky-blue" />
            <DialogTitle>Integration Settings</DialogTitle>
          </div>
          <DialogDescription>
            Configure how this integration sends notifications to Slack.
          </DialogDescription>
        </DialogHeader>
        
        {integration && (
          <div className="space-y-6">
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
          </div>
        )}
        
        <div className="flex justify-end space-x-2">
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
