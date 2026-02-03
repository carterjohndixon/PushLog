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
import { Settings, Github, GitBranch } from "lucide-react";
import { UseMutationResult } from "@tanstack/react-query";
import React from "react"; // Added missing import

interface RepositoryCardData {
  id?: number;
  githubId: string;
  name: string;
  full_name: string; // GitHub API uses full_name
  owner: { login: string }; // GitHub API owner is an object
  default_branch: string; // GitHub API uses default_branch
  isActive?: boolean;
  isConnected: boolean;
  pushEvents?: number;
  lastPush?: string;
  private: boolean;
  monitorAllBranches?: boolean; // Added monitorAllBranches to the interface
  // Add other GitHub API fields that might be present
  [key: string]: any;
}

interface RepositorySettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repository: RepositoryCardData | null;
  updateRepositoryMutation: UseMutationResult<any, Error, { id: number; updates: any }, unknown>;
}

export function RepositorySettingsModal({
  open,
  onOpenChange,
  repository,
  updateRepositoryMutation,
}: RepositorySettingsModalProps) {
  // Initialize state from repository data when it changes
  const [isActive, setIsActive] = useState(repository?.isActive ?? true);
  const [monitorAllBranches, setMonitorAllBranches] = useState(repository?.monitorAllBranches ?? false);

  // Update local state when repository prop changes
  React.useEffect(() => {
    if (repository) {
      setIsActive(repository.isActive ?? true);
      setMonitorAllBranches(repository.monitorAllBranches ?? false);
    }
  }, [repository]);

  const handleSave = () => {
    if (!repository?.id) return;

    const updates = {
      isActive: isActive,
      monitorAllBranches: monitorAllBranches,
    };
    
    updateRepositoryMutation.mutate({
      id: repository.id,
      updates,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
      if (repository) {
        setIsActive(repository.isActive ?? true);
        setMonitorAllBranches(repository.monitorAllBranches ?? false);
      }
    }
    onOpenChange(newOpen);
  };

  // Don't render the modal content if repository is null
  if (!repository) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center space-x-2">
              <Settings className="w-5 h-5 text-log-green" />
              <DialogTitle>Repository Settings</DialogTitle>
            </div>
            <DialogDescription>
              Loading repository data...
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-log-green" />
            <DialogTitle>Repository Settings</DialogTitle>
          </div>
          <DialogDescription>
            Configure how this repository is monitored and connected.
          </DialogDescription>
        </DialogHeader>
        
        {repository && typeof repository === 'object' && (
          <div className="space-y-6">
            {/* Repository Info */}
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                  <Github className="text-white w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-graphite">{repository?.name || 'Unknown Repository'}</p> 
                  <p className="text-sm text-steel-gray">{repository?.owner?.login || 'Unknown'}/{repository?.name || 'Unknown'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-log-green rounded flex items-center justify-center">
                  <GitBranch className="text-white w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-graphite">{repository?.default_branch || 'main'}</p>
                  <p className="text-sm text-steel-gray">Default Branch</p>
                </div>
              </div>
            </div>
            
            {/* Repository Status */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="repository-active">Repository Active</Label>
                <p className="text-xs text-steel-gray">
                  Enable or disable monitoring for this repository. When disabled, no push events will be tracked. 
                  If you have integrations, unpausing them will automatically activate this repository.
                </p>
              </div>
              <Switch
                id="repository-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>

            {/* Monitor All Branches */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="monitor-all-branches">Monitor All Branches</Label>
                <p className="text-xs text-steel-gray">
                  Enable to track activity across all branches of this repository.
                </p>
              </div>
              <Switch
                id="monitor-all-branches"
                checked={monitorAllBranches}
                onCheckedChange={setMonitorAllBranches}
              />
            </div>

            {/* Integration Status Indicator */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-graphite">Integration Status</p>
                  <p className="text-xs text-steel-gray">
                    {repository?.id ? 'Check if this repository has active integrations' : 'Repository not yet connected'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-steel-gray" />
                  <span className="text-xs text-steel-gray">
                    {repository?.id ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
              {repository?.isActive === false && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                  <p>⚠️ This repository is currently paused. Enable it above to start monitoring.</p>
                  <p className="mt-1">💡 <strong>Note:</strong> If you have integrations for this repository, unpausing them on the Integrations page will automatically activate this repository.</p>
                </div>
              )}
            </div>

            {/* Repository Stats */}
            {repository?.pushEvents !== undefined && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-graphite mb-2">Repository Activity</h4>
                <div className="space-y-1 text-sm">
                  <p className="text-steel-gray">
                    Total push events: <span className="font-medium text-graphite">{repository?.pushEvents || 0}</span>
                  </p>
                  {repository?.lastPush && (
                    <p className="text-steel-gray">
                      Last activity: <span className="font-medium text-graphite">{repository?.lastPush}</span>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => handleOpenChange(false)}
            disabled={updateRepositoryMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateRepositoryMutation.isPending}
            variant="glow"
            className="text-white"
          >
            {updateRepositoryMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
