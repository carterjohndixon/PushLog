import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Github } from "lucide-react";
import { UseMutationResult } from "@tanstack/react-query";

interface Repository {
  id?: number;
  githubId: string;
  name: string;
  owner: string;
  lastPush?: string;
}

interface ConfirmRepositoryDeletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositoryToDelete: Repository | null;
  deleteRepositoryMutation: UseMutationResult<any, Error, number, unknown>;
}

export function ConfirmRepositoryDeletionModal({
  open,
  onOpenChange,
  repositoryToDelete,
  deleteRepositoryMutation,
}: ConfirmRepositoryDeletionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <DialogTitle>Delete Repository</DialogTitle>
          </div>
          <DialogDescription>
            Are you sure you want to delete this repository? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        {repositoryToDelete && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                  <Github className="text-white w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-graphite">{repositoryToDelete.name}</p> 
                  <p className="text-sm text-steel-gray">Repository</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={deleteRepositoryMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (repositoryToDelete) {
                deleteRepositoryMutation.mutate(repositoryToDelete.id!);
              }
            }}
            disabled={deleteRepositoryMutation.isPending}
          >
            {deleteRepositoryMutation.isPending ? 'Deleting...' : 'Delete Repository'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}