"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { formatLocalDate } from "@/lib/date";
import { Users, UserPlus, User, Shield, Settings, ArrowLeft, Copy, Mail, Link2 } from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ORG_QUERY_KEY = ["org"];
const ORG_MEMBERS_QUERY_KEY = ["org", "members"];

function fetchOrg() {
  return apiRequest("GET", "/api/org").then((r) => r.json()) as Promise<{
    id: string;
    name: string;
    type: string;
  }>;
}

function fetchOrgMembers() {
  return apiRequest("GET", "/api/org/members").then((r) => r.json()) as Promise<{
    members: { userId: string; role: string; joinedAt: string | null; displayName: string }[];
  }>;
}

const ROLE_ORDER = ["owner", "admin", "developer", "viewer"];
const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  viewer: "Viewer",
};

const INVITE_ROLES = ["admin", "developer", "viewer"] as const;

export default function OrganizationPage() {
  const { toast } = useToast();
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLinkRole, setInviteLinkRole] = useState<string>("developer");
  const [emailInviteEmail, setEmailInviteEmail] = useState("");
  const [emailInviteRole, setEmailInviteRole] = useState<string>("developer");

  const { data: profileResponse } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    retry: false,
  });
  const { data: orgData, isLoading: orgLoading, error: orgError } = useQuery({
    queryKey: ORG_QUERY_KEY,
    queryFn: fetchOrg,
    enabled: !!profileResponse?.user?.organizationId,
  });
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ORG_MEMBERS_QUERY_KEY,
    queryFn: fetchOrgMembers,
    enabled: !!profileResponse?.user?.organizationId,
  });

  const user = profileResponse?.user;
  const currentUserId = user?.id;
  const canInvite = user?.role === "owner" || user?.role === "admin";
  const members = membersData?.members ?? [];
  const sortedMembers = [...members].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );

  const createInviteLinkMutation = useMutation({
    mutationFn: async (opts?: { role?: string; expiresInDays?: number }) => {
      const res = await fetch("/api/org/invites/link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          role: opts?.role ?? inviteLinkRole,
          expiresInDays: opts?.expiresInDays ?? 7,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create invite link");
      return data as { joinUrl: string; expiresAt: string; role: string };
    },
    onSuccess: (data) => {
      setInviteLink(data.joinUrl);
      toast({
        title: "Invite link created",
        description: "Share this link with anyone you want to add. They sign in (or sign up) and accept. Link expires in 7 days.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create link", description: err.message, variant: "destructive" });
    },
  });

  const sendEmailInviteMutation = useMutation({
    mutationFn: async (params: { email: string; role?: string }) => {
      const res = await fetch("/api/org/invites/email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          email: params.email.trim().toLowerCase(),
          role: params.role ?? "developer",
          expiresInDays: 7,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send invite");
      return data;
    },
    onSuccess: (_data, variables) => {
      setEmailInviteEmail("");
      toast({
        title: "Invite sent",
        description: `An email with a sign-in link was sent to ${variables.email}. They can join the team after logging in.`,
      });
      setInviteModalOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSendEmailInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInviteEmail.trim().toLowerCase();
    if (!email) {
      toast({ title: "Enter an email", variant: "destructive" });
      return;
    }
    sendEmailInviteMutation.mutate({ email, role: emailInviteRole });
  };

  const revokeInviteLink = () => {
    setInviteLink(null);
    toast({ title: "Link cleared", description: "Create a new link when you're ready. Existing links will still expire in 7 days." });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!user.organizationId) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">You are not in an organization.</p>
              <Link href="/settings">
                <Button variant="outline" className="mt-4">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  if (orgError || (orgData === undefined && !orgLoading)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">Failed to load organization.</p>
              <Link href="/settings">
                <Button variant="outline" className="mt-4">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>

        <div className="space-y-8">
          {/* Organization overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-log-green/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-log-green" />
                  </div>
                  <div>
                    {orgLoading ? (
                      <Skeleton className="h-7 w-48 mb-2" />
                    ) : (
                      <CardTitle className="text-xl">{orgData?.name ?? "Organization"}</CardTitle>
                    )}
                    <CardDescription>
                      {orgLoading ? (
                        <Skeleton className="h-4 w-24 mt-1" />
                      ) : (
                        <>
                          {orgData?.type === "team" ? "Team" : "Solo developer"} · {members.length} member{members.length !== 1 ? "s" : ""}
                        </>
                      )}
                    </CardDescription>
                  </div>
                </div>
                {canInvite && (
                  <Button
                    variant="glow"
                    className="text-white"
                    onClick={() => setInviteModalOpen(true)}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite member
                  </Button>
                )}
              </div>
            </CardHeader>
          </Card>

          {/* Invite modal (owner & admin only) */}
          {canInvite && (
            <>
              <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-log-green" />
                      Invite to team
                    </DialogTitle>
                    <DialogDescription>
                      Manage access to your organization. Invite people by email or create a link—they create their own account or sign in to join.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6 pt-2">
                    {/* Primary: Invite by email */}
                    <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/30">
                      <h3 className="font-medium text-foreground">Invite by email</h3>
                      <p className="text-sm text-muted-foreground">
                        We'll send them a link. They create an account or sign in to join your team.
                      </p>
                      <form onSubmit={handleSendEmailInvite} className="flex flex-wrap items-end gap-2">
                        <Input
                          type="email"
                          placeholder="colleague@example.com"
                          value={emailInviteEmail}
                          onChange={(e) => setEmailInviteEmail(e.target.value)}
                          disabled={sendEmailInviteMutation.isPending}
                          className="flex-1 min-w-[180px]"
                        />
                        <Select value={emailInviteRole} onValueChange={setEmailInviteRole}>
                          <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                          <SelectContent>
                            {INVITE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="submit" disabled={sendEmailInviteMutation.isPending}>
                          {sendEmailInviteMutation.isPending ? "Sending…" : "Send invite"}
                        </Button>
                      </form>
                      <p className="text-xs text-muted-foreground">Expires in 7 days.</p>
                    </div>

                    {/* Secondary: Create invite link */}
                    <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/20">
                      <h3 className="text-sm font-medium text-foreground">Create invite link</h3>
                      <p className="text-xs text-muted-foreground">
                        Anyone with this link can join as {ROLE_LABELS[inviteLinkRole]}. Link expires in 7 days.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select value={inviteLinkRole} onValueChange={setInviteLinkRole}>
                          <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                          <SelectContent>
                            {INVITE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={createInviteLinkMutation.isPending}
                          onClick={() => createInviteLinkMutation.mutate({ role: inviteLinkRole, expiresInDays: 7 })}
                        >
                          {createInviteLinkMutation.isPending ? "Creating…" : "Create link"}
                        </Button>
                      </div>
                      {inviteLink && (
                        <div className="space-y-2 pt-1">
                          <div className="flex gap-2 items-center">
                            <Input readOnly value={inviteLink} className="font-mono text-xs flex-1" />
                            <Button
                              variant="outline"
                              size="icon"
                              title="Copy link"
                              onClick={() => {
                                navigator.clipboard.writeText(inviteLink);
                                toast({ title: "Copied", description: "Invite link copied to clipboard." });
                              }}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={revokeInviteLink}>
                            Revoke link
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}

          {/* Team members */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-log-green" />
                Team members
              </CardTitle>
              <CardDescription>
                Everyone with access to this organization. You manage membership and roles—not their personal accounts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 rounded-lg" />
                  ))}
                </div>
              ) : sortedMembers.length === 0 ? (
                <p className="text-muted-foreground py-4">No members found.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedMembers.map((member) => (
                    <div
                      key={member.userId}
                      className={`flex items-center gap-4 p-4 rounded-lg border border-border bg-card ${
                        member.userId === String(currentUserId) ? "ring-2 ring-log-green/30" : ""
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {member.displayName}
                          {member.userId === String(currentUserId) && (
                            <span className="text-muted-foreground font-normal ml-1">(you)</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="capitalize font-normal">
                            {ROLE_LABELS[member.role] ?? member.role}
                          </Badge>
                        </div>
                        {member.joinedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Joined {formatLocalDate(member.joinedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
