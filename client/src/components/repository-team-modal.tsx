import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Users } from "lucide-react";

interface RepositoryCardData {
  id?: string;
  name: string;
  full_name?: string;
  [key: string]: any;
}

interface OrgMember {
  userId: string;
  role: string;
  displayName: string;
  username: string | null;
  email: string | null;
}

interface RepositoryTeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repository: RepositoryCardData | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  viewer: "Viewer",
};

export function RepositoryTeamModal({
  open,
  onOpenChange,
  repository,
}: RepositoryTeamModalProps) {
  const queryClient = useQueryClient();
  const repositoryId = repository?.id ?? "";

  const { data: orgMembers = {}, isLoading: membersLoading } = useQuery<{ members: OrgMember[] }>({
    queryKey: ["/api/org/members"],
    queryFn: () => fetch("/api/org/members", { credentials: "include" }).then((r) => r.json()),
    enabled: open,
  });

  const { data: repoMembers, isLoading: repoMembersLoading } = useQuery<{ memberUserIds: string[] }>({
    queryKey: ["/api/org/repositories", repositoryId, "members"],
    queryFn: () =>
      fetch(`/api/org/repositories/${encodeURIComponent(repositoryId)}/members`, {
        credentials: "include",
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    enabled: open && !!repositoryId,
  });

  const saveMutation = useMutation({
    mutationFn: (memberUserIds: string[]) =>
      fetch(`/api/org/repositories/${encodeURIComponent(repositoryId)}/members`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberUserIds }),
      }).then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(new Error(d?.error || "Failed to save")));
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org/repositories", repositoryId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/repositories-and-integrations"] });
      onOpenChange(false);
    },
  });

  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const members = orgMembers.members ?? [];
  const memberUserIds = repoMembers?.memberUserIds ?? [];

  useEffect(() => {
    if (!open) return;
    if (memberUserIds.length === 0) {
      setMode("all");
      setSelectedIds(new Set());
    } else {
      setMode("selected");
      setSelectedIds(new Set(memberUserIds));
    }
  }, [open, memberUserIds.join(",")]);

  const handleToggle = (userId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const handleSave = () => {
    if (mode === "all") {
      saveMutation.mutate([]);
    } else {
      saveMutation.mutate([...selectedIds]);
    }
  };

  const isLoading = membersLoading || repoMembersLoading;
  const isSaving = saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-log-green" />
            Team for {repository?.name ?? "repository"}
          </DialogTitle>
          <DialogDescription>
            Choose who in your organization can see and use this repository. Owners and admins always see all repos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="team-mode-all"
                    checked={mode === "all"}
                    onCheckedChange={(c) => setMode(c ? "all" : "selected")}
                  />
                  <Label htmlFor="team-mode-all" className="font-normal cursor-pointer">
                    All org members
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Everyone in the organization can see this repo and add integrations to it.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="team-mode-selected"
                    checked={mode === "selected"}
                    onCheckedChange={(c) => setMode(c ? "selected" : "all")}
                  />
                  <Label htmlFor="team-mode-selected" className="font-normal cursor-pointer">
                    Only these members
                  </Label>
                </div>
                {mode === "selected" && (
                  <div className="pl-6 max-h-48 overflow-y-auto rounded-md border border-border p-3 space-y-2">
                    {members.map((m) => (
                      <div key={m.userId} className="flex items-center space-x-2">
                        <Checkbox
                          id={`team-member-${m.userId}`}
                          checked={selectedIds.has(m.userId)}
                          onCheckedChange={(c) => handleToggle(m.userId, !!c)}
                        />
                        <Label
                          htmlFor={`team-member-${m.userId}`}
                          className="font-normal cursor-pointer text-sm flex-1"
                        >
                          {m.displayName}
                          <span className="text-muted-foreground ml-1">
                            ({ROLE_LABELS[m.role] ?? m.role})
                          </span>
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
