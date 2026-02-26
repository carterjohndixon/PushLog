"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2 } from "lucide-react";

const DISMISS_KEY_PREFIX = "pushlog_setup_org_dismissed_";

export function getSetupOrgDismissKey(orgId: string): string {
  return `${DISMISS_KEY_PREFIX}${orgId}`;
}

export function isSetupOrgDismissed(orgId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(getSetupOrgDismissKey(orgId)) === "true";
}

export function setSetupOrgDismissed(orgId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getSetupOrgDismissKey(orgId), "true");
}

export interface SetupOrganizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  initialName: string;
  initialDomain?: string | null;
  /** 'setup' = first-time flow with Skip; 'edit' = edit from Organization page, no Skip */
  mode: "setup" | "edit";
  onSuccess?: () => void;
  onSkip?: () => void;
}

export function SetupOrganizationModal({
  open,
  onOpenChange,
  orgId,
  initialName,
  initialDomain,
  mode,
  onSuccess,
  onSkip,
}: SetupOrganizationModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDomain(initialDomain ?? "");
    }
  }, [open, initialName, initialDomain]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: "Name required", description: "Enter an organization name.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          domain: domain.trim() ? domain.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Update failed", description: data.error || "Could not update organization.", variant: "destructive" });
        return;
      }
      toast({
        title: "Organization updated",
        description: mode === "setup" ? "You can now invite teammates." : "Your changes have been saved.",
      });
      onOpenChange(false);
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    setSetupOrgDismissed(orgId);
    onOpenChange(false);
    onSkip?.();
  };

  const isSetup = mode === "setup";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-log-green/10">
              <Building2 className="h-5 w-5 text-log-green" />
            </div>
            <DialogTitle className="text-xl">
              {isSetup ? "Set up your organization" : "Edit organization"}
            </DialogTitle>
          </div>
          <DialogDescription>
            {isSetup
              ? "Add your company name (and optional domain). You can invite teammates next."
              : "Update your organization name or company domain."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc"
              maxLength={60}
              disabled={saving}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="org-domain">Company domain (optional)</Label>
            <Input
              id="org-domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="acme.com"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">e.g. acme.com — no http:// or path</p>
          </div>
        </div>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div>
            {isSetup && onSkip && (
              <Button type="button" variant="ghost" onClick={handleSkip} disabled={saving} className="text-muted-foreground">
                Skip for now
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
