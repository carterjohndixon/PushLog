import { useState, useEffect } from "react";
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
  id?: string;
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
  monitorAllBranches?: boolean;
  /** Path prefixes for incident correlation (e.g. ["src/auth", "src/payments"]). */
  criticalPaths?: string[] | null;
  /** Optional Sentry/service name mapping for multi-repo correlation. */
  incidentServiceName?: string | null;
  [key: string]: any;
}

interface RepositorySettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repository: RepositoryCardData | null;
  updateRepositoryMutation: UseMutationResult<any, Error, { id: string; updates: any }, unknown>;
}

function getFormState(repo: RepositoryCardData | null) {
  return {
    isActive: repo?.isActive ?? true,
    monitorAllBranches: repo?.monitorAllBranches ?? false,
    criticalPathsText: (repo?.criticalPaths ?? []).filter(Boolean).join("\n"),
    incidentServiceName: repo?.incidentServiceName ?? "",
  };
}

export function RepositorySettingsModal({
  open,
  onOpenChange,
  repository,
  updateRepositoryMutation,
}: RepositorySettingsModalProps) {
  const [form, setForm] = useState(() => getFormState(repository));

  useEffect(() => {
    if (repository) setForm(getFormState(repository));
  }, [repository]);

  const handleSave = () => {
    if (!repository?.id) return;

    const criticalPaths = form.criticalPathsText
      .split(/[\n,]+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const updates: Record<string, unknown> = {
      isActive: form.isActive,
      monitorAllBranches: form.monitorAllBranches,
      criticalPaths,
      incidentServiceName: form.incidentServiceName.trim() || null,
    };

    updateRepositoryMutation.mutate({
      id: repository.id,
      updates,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    // Don't reset form on close: it causes a visible "revert" during the close animation
    // when the parent's repository prop hasn't updated yet (e.g. right after save). On reopen,
    // useEffect will set the form from the fresh repository.
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
          <div className="space-y-6 p-4 border border-border rounded-lg bg-muted/50">
            {/* Repository Info */}
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-secondary rounded flex items-center justify-center">
                  <Github className="text-foreground w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{repository?.name || 'Unknown Repository'}</p>
                  <p className="text-sm text-muted-foreground">{repository?.owner?.login ?? repository?.name ?? 'Unknown'}/{repository?.name ?? 'Unknown'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-log-green rounded flex items-center justify-center">
                  <GitBranch className="text-white w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{repository?.default_branch || 'main'}</p>
                  <p className="text-sm text-muted-foreground">Default Branch</p>
                </div>
              </div>
            </div>

            {/* Repository Status */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="repository-active">Repository Active</Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable monitoring for this repository. When disabled, no push events will be tracked.
                  If you have integrations, unpausing them on the Integrations page will automatically activate this repository.
                </p>
              </div>
              <Switch
                id="repository-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm(s => ({ ...s, isActive: v }))}
              />
            </div>

            {/* Monitor All Branches */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="monitor-all-branches">Monitor All Branches</Label>
                <p className="text-xs text-muted-foreground">
                  Enable to track activity across all branches of this repository.
                </p>
              </div>
              <Switch
                id="monitor-all-branches"
                checked={form.monitorAllBranches}
                onCheckedChange={(v) => setForm(s => ({ ...s, monitorAllBranches: v }))}
              />
            </div>

            {/* Critical paths for incident correlation */}
            <div className="space-y-2">
              <Label htmlFor="critical-paths">Critical paths (incident correlation)</Label>
              <p className="text-xs text-muted-foreground">
                Path prefixes or folder names that matter most (e.g. src/auth, src/payments, migrations). One per line or comma-separated. Commits touching these get boosted when correlating incidents.
              </p>
              <textarea
                id="critical-paths"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="src/auth&#10;src/payments&#10;migrations"
                value={form.criticalPathsText}
                onChange={(e) => setForm(s => ({ ...s, criticalPathsText: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Incident service name (optional service mapping) */}
            <div className="space-y-2">
              <Label htmlFor="incident-service-name">Incident service name</Label>
              <p className="text-xs text-muted-foreground">
                Optional. If you use Sentry or another tool, set the service name that matches this repo (e.g. &quot;api&quot;) for better multi-repo correlation.
              </p>
              <input
                id="incident-service-name"
                type="text"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="e.g. api"
                value={form.incidentServiceName}
                onChange={(e) => setForm(s => ({ ...s, incidentServiceName: e.target.value }))}
              />
            </div>

            {/* Integration Status Indicator */}
            <div className="p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">Integration Status</p>
                  <p className="text-xs text-muted-foreground">
                    {repository?.id ? 'Whether this repository has an integration (repo → Slack channel)' : 'Repository not yet connected'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${repository?.id ? 'bg-log-green' : 'bg-muted-foreground'}`} />
                  <span className="text-sm font-medium text-foreground">
                    {repository?.id ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
              {repository?.isActive === false && (
                <div className="mt-2 p-2 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 rounded text-xs text-amber-800 dark:text-amber-200">
                  <p>⚠️ This repository is currently paused. Enable it above to start monitoring.</p>
                  <p className="mt-1">💡 If you have integrations for this repository, unpausing them on the Integrations page will automatically activate this repository.</p>
                </div>
              )}
            </div>

            {/* Repository Stats */}
            {(repository?.pushEvents !== undefined || repository?.lastPush) && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium text-foreground mb-2">Repository Activity</h4>
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">
                    Total push events: <span className="font-medium text-foreground">{repository?.pushEvents ?? 0}</span>
                  </p>
                  {repository?.lastPush && (
                    <p className="text-muted-foreground">
                      Last activity: <span className="font-medium text-foreground">{repository?.lastPush}</span>
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
