import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Clock, Github } from "lucide-react";
import { SiSlack } from "react-icons/si";
import { UseMutationResult } from "@tanstack/react-query";
import { formatLocalDate } from "@/lib/date";
import type { ActiveIntegration } from "@/lib/types";

interface ConfirmIntegrationDeletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationToDelete: ActiveIntegration | null;
  deleteIntegrationMutation: UseMutationResult<any, Error, string, unknown>;
}

export function ConfirmIntegrationDeletionModal({
  open,
  onOpenChange,
  integrationToDelete,
  deleteIntegrationMutation,
}: ConfirmIntegrationDeletionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <DialogTitle>Delete Integration</DialogTitle>
          </div>
          <DialogDescription>
            Are you sure you want to delete this integration? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        {integrationToDelete && (
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 dark:bg-muted rounded-lg border border-border">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-foreground rounded flex items-center justify-center">
                  <Github className="text-background w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{integrationToDelete.repositoryName}</p>
                  <p className="text-sm text-muted-foreground">Repository</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-[#4A154B] dark:bg-[#611f69] rounded flex items-center justify-center">
                  <SiSlack className="text-white w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">#{integrationToDelete.slackChannelName}</p>
                  <p className="text-sm text-muted-foreground">Slack Channel</p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Last used: {integrationToDelete.lastUsed
                ? formatLocalDate(integrationToDelete.lastUsed)
                : "Never"}</span>
            </div>
          </div>
        )}
        
        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={deleteIntegrationMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (integrationToDelete) {
                deleteIntegrationMutation.mutate(integrationToDelete.id);
              }
            }}
            disabled={deleteIntegrationMutation.isPending}
          >
            {deleteIntegrationMutation.isPending ? 'Deleting...' : 'Delete Integration'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}