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

interface Integration {
  id: number;
  repositoryName: string;
  slackChannelName: string;
  lastUsed?: string;
}

interface ConfirmIntegrationDeletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationToDelete: Integration | null;
  deleteIntegrationMutation: UseMutationResult<any, Error, number, unknown>;
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
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                  <Github className="text-white w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-graphite">{integrationToDelete.repositoryName}</p> 
                  <p className="text-sm text-steel-gray">Repository</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-sky-blue rounded flex items-center justify-center">
                  <SiSlack className="text-white w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-graphite">#{integrationToDelete.slackChannelName}</p>
                  <p className="text-sm text-steel-gray">Slack Channel</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-steel-gray">
              <Clock className="w-4 h-4" />
              <span>Last used: {integrationToDelete.lastUsed || 'Never'}</span>
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