"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { formatLocalDate, formatLocalDateTime } from "@/lib/date";
import { Users, UserPlus, User, Shield, Settings, ArrowLeft, Copy, Mail, Link2, UserMinus, ChevronRight, Pencil, Github, Loader2 } from "lucide-react";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { SetupOrganizationModal, isSetupOrgDismissed } from "@/components/setup-organization-modal";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Bell, Trash2, ChevronUp, ChevronDown } from "lucide-react";

const ORG_QUERY_KEY = ["org"];
const ORG_MEMBERS_QUERY_KEY = ["org", "members"];
const ORG_INCIDENT_SETTINGS_QUERY_KEY = ["org", "incident-settings"];
const GITHUB_ORG_STORAGE_KEY = "pushlog-selected-github-org";

type IncidentSettingsPayload = {
  targetingMode: "users_with_repos" | "all_members" | "specific_users";
  specificUserIds: string[] | null;
  specificRoles: string[] | null;
  priorityUserIds: string[] | null;
  includeViewers: boolean;
  updatedAt: string;
};

function fetchOrgIncidentSettings() {
  return apiRequest("GET", "/api/org/incident-settings").then((r) => r.json()) as Promise<IncidentSettingsPayload>;
}

function fetchOrg() {
  return apiRequest("GET", "/api/org").then((r) => r.json()) as Promise<{
    id: string;
    name: string;
    domain?: string | null;
    type: string;
    memberCount: number;
    isDefaultOrgName: boolean;
  }>;
}

function fetchOrgMembers() {
  return apiRequest("GET", "/api/org/members").then((r) => r.json()) as Promise<{
    members: { userId: string; role: string; joinedAt: string | null; invitedAt: string | null; inviteUsedAt: string | null; inviteType: string | null; displayName: string; username: string | null; email: string | null; lastActiveAt: string | null }[];
  }>;
}

type Member = { userId: string; role: string; joinedAt: string | null; invitedAt: string | null; inviteUsedAt: string | null; inviteType: string | null; displayName: string; username: string | null; email: string | null; lastActiveAt: string | null };

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
  const queryClient = useQueryClient();
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLinkRole, setInviteLinkRole] = useState<string>("developer");
  const [emailInviteEmail, setEmailInviteEmail] = useState("");
  const [emailInviteRole, setEmailInviteRole] = useState<string>("developer");
  const [memberToRemove, setMemberToRemove] = useState<{ userId: string; displayName: string } | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupModalMode, setSetupModalMode] = useState<"setup" | "edit">("setup");
  // Incident notification targeting form (owner/admin)
  const [incidentMode, setIncidentMode] = useState<IncidentSettingsPayload["targetingMode"]>("users_with_repos");
  const [incidentSpecificUserIds, setIncidentSpecificUserIds] = useState<string[]>([]);
  const [incidentSpecificRoles, setIncidentSpecificRoles] = useState<string[]>([]);
  const [incidentIncludeViewers, setIncidentIncludeViewers] = useState(false);
  const [incidentPriorityUserIds, setIncidentPriorityUserIds] = useState<string[]>([]);
  const [githubInviteModalOpen, setGithubInviteModalOpen] = useState(false);
  const [selectedGitHubOrgLogin, setSelectedGitHubOrgLogin] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(GITHUB_ORG_STORAGE_KEY) ?? "";
  });
  const [githubInviteRole, setGithubInviteRole] = useState<string>("developer");

  const { data: profileResponse, isLoading: profileLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    retry: false,
  });
  const [noOrgMessageReady, setNoOrgMessageReady] = useState(false);
  useEffect(() => {
    if (profileResponse?.user && !profileResponse.user.organizationId) {
      const t = window.setTimeout(() => setNoOrgMessageReady(true), 2000);
      return () => window.clearTimeout(t);
    }
    setNoOrgMessageReady(false);
  }, [profileResponse?.user?.organizationId]);
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
  const { data: incidentSettingsData } = useQuery({
    queryKey: ORG_INCIDENT_SETTINGS_QUERY_KEY,
    queryFn: fetchOrgIncidentSettings,
    enabled: !!profileResponse?.user?.organizationId && (profileResponse?.user?.role === "owner" || profileResponse?.user?.role === "admin"),
  });

  const { data: githubOrgs = [], isLoading: githubOrgsLoading, isError: githubOrgsErrorState, error: githubOrgsError } = useQuery({
    queryKey: ["org", "github-orgs"],
    queryFn: () => apiRequest("GET", "/api/org/github-orgs").then((r) => r.json()) as Promise<{ login: string; id: number; avatar_url: string | null; description: string | null }[]>,
    enabled: githubInviteModalOpen && !!profileResponse?.user?.organizationId && (profileResponse?.user?.role === "owner" || profileResponse?.user?.role === "admin") && !!profileResponse?.user?.githubConnected,
  });

  const { data: githubOrgMembers = [], isLoading: githubOrgMembersLoading } = useQuery({
    queryKey: ["org", "github-orgs", selectedGitHubOrgLogin, "members"],
    queryFn: () =>
      apiRequest("GET", `/api/org/github-orgs/${encodeURIComponent(selectedGitHubOrgLogin)}/members`).then((r) =>
        r.json()
      ) as Promise<{ login: string; id: number; avatar_url: string | null; inPushLogOrg: boolean; pushlogUserId: string | null; pushlogRole: string | null }[]>,
    enabled: githubInviteModalOpen && !!selectedGitHubOrgLogin,
  });

  useEffect(() => {
    if (githubInviteModalOpen && githubOrgs.length > 0) {
      if (!selectedGitHubOrgLogin) {
        const saved = typeof window !== "undefined" ? window.localStorage.getItem(GITHUB_ORG_STORAGE_KEY) : null;
        if (saved && githubOrgs.some((o) => o.login === saved)) setSelectedGitHubOrgLogin(saved);
      } else if (!githubOrgs.some((o) => o.login === selectedGitHubOrgLogin)) {
        setSelectedGitHubOrgLogin("");
      }
    }
  }, [githubInviteModalOpen, githubOrgs, selectedGitHubOrgLogin]);

  const user = profileResponse?.user;
  const currentUserId = user?.id;
  const canInvite = user?.role === "owner" || user?.role === "admin";
  const members = membersData?.members ?? [];
  const sortedMembers = [...members].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );

  const isSolo = (orgData?.memberCount ?? 0) <= 1;
  const showSetupPrompt =
    !isSolo &&
    canInvite &&
    orgData?.memberCount === 1 &&
    !!orgData?.isDefaultOrgName &&
    !!orgData?.id &&
    !isSetupOrgDismissed(orgData.id);

  useEffect(() => {
    if (showSetupPrompt && orgData?.id) {
      setSetupModalMode("setup");
      setSetupModalOpen(true);
    }
  }, [showSetupPrompt, orgData?.id]);

  useEffect(() => {
    if (!incidentSettingsData) return;
    setIncidentMode(incidentSettingsData.targetingMode);
    setIncidentSpecificUserIds(incidentSettingsData.specificUserIds ?? []);
    setIncidentSpecificRoles(incidentSettingsData.specificRoles ?? []);
    setIncidentIncludeViewers(incidentSettingsData.includeViewers);
    setIncidentPriorityUserIds(incidentSettingsData.priorityUserIds ?? []);
  }, [incidentSettingsData]);

  // When members list updates (e.g. after refetch on opening modal), keep selected member in sync so "Last active" is fresh
  useEffect(() => {
    if (!selectedMember || members.length === 0) return;
    const fresh = members.find((m) => m.userId === selectedMember.userId);
    if (fresh && (fresh.lastActiveAt !== selectedMember.lastActiveAt || fresh.role !== selectedMember.role)) {
      setSelectedMember(fresh);
    }
  }, [members, selectedMember?.userId]);

  const handleSetupSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEY });
  };

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
        description: `An email with a sign-in link was sent to ${variables.email}. They can join the organization after logging in.`,
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

  const revokeInviteLinkMutation = useMutation({
    mutationFn: async (joinUrl: string) => {
      const res = await fetch("/api/org/invites/revoke-link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ joinUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        return { alreadyInvalid: true } as const;
      }
      if (!res.ok) throw new Error(data.error || "Failed to revoke link");
      return data;
    },
    onSuccess: (data: { alreadyInvalid?: boolean }) => {
      setInviteLink(null);
      if (data?.alreadyInvalid) {
        toast({ title: "Link already invalid", description: "This link was already used or expired. It can no longer be used." });
      } else {
        toast({ title: "Invite link revoked", description: "The link no longer works. Create a new link if needed." });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Revoke failed", description: err.message, variant: "destructive" });
    },
  });

  const revokeInviteLink = () => {
    if (inviteLink) revokeInviteLinkMutation.mutate(inviteLink);
  };

  const [sendingInviteToLogin, setSendingInviteToLogin] = useState<string | null>(null);
  const sendGitHubMemberInviteMutation = useMutation({
    mutationFn: async (params: { githubLogin: string; role: string }) => {
      const res = await fetch("/api/org/invites/github-member", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ githubLogin: params.githubLogin, role: params.role ?? "developer" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "Failed to send invite") as Error & { code?: string };
        err.code = data.code;
        throw err;
      }
      return data as { success: boolean; message: string; emailSent: boolean };
    },
    onMutate: (variables) => {
      setSendingInviteToLogin(variables.githubLogin);
    },
    onSuccess: (_data, variables) => {
      setSendingInviteToLogin(null);
      toast({
        title: "Invite sent",
        description: `An invite email was sent to the address on ${variables.githubLogin}'s GitHub profile. They can join as ${ROLE_LABELS[variables.role]}.`,
      });
    },
    onError: (err: Error & { code?: string }) => {
      setSendingInviteToLogin(null);
      toast({
        title: err.code === "EMAIL_NOT_PUBLIC" ? "Email not visible on GitHub" : "Send failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  /** Copy invite link for a GitHub org member (create link with current role if none exists). Used when email isn't public. */
  const copyInviteLinkForGitHubMember = (memberLogin: string) => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      toast({ title: "Copied", description: `Send this link to ${memberLogin} to join as ${ROLE_LABELS[githubInviteRole]}.` });
      return;
    }
    createInviteLinkMutation.mutate(
      { role: githubInviteRole, expiresInDays: 7 },
      {
        onSuccess: (data) => {
          setInviteLink(data.joinUrl);
          navigator.clipboard.writeText(data.joinUrl);
          toast({ title: "Copied", description: `Send this link to ${memberLogin} to join as ${ROLE_LABELS[githubInviteRole]}.` });
        },
      }
    );
  };

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/org/members/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to remove member");
      return data;
    },
    onSuccess: () => {
      setMemberToRemove(null);
      setSelectedMember(null);
      queryClient.invalidateQueries({ queryKey: ORG_MEMBERS_QUERY_KEY });
      toast({ title: "Member removed", description: "They no longer have access to this organization." });
    },
    onError: (err: Error) => {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch(`/api/org/members/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update role");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_MEMBERS_QUERY_KEY });
      toast({ title: "Role updated", description: "The member's role has been changed." });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const saveIncidentSettingsMutation = useMutation({
    mutationFn: async (payload: {
      targetingMode: IncidentSettingsPayload["targetingMode"];
      specificUserIds: string[] | null;
      specificRoles: string[] | null;
      priorityUserIds: string[] | null;
      includeViewers: boolean;
    }) => {
      const res = await fetch("/api/org/incident-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to update incident settings");
      return data as IncidentSettingsPayload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_INCIDENT_SETTINGS_QUERY_KEY });
      toast({ title: "Incident settings saved", description: "Who receives alerts has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSaveIncidentSettings = () => {
    if (incidentMode === "specific_users" && incidentSpecificUserIds.length === 0 && incidentSpecificRoles.length === 0) {
      toast({ title: "Select at least one", description: "Choose specific users or roles to notify.", variant: "destructive" });
      return;
    }
    saveIncidentSettingsMutation.mutate({
      targetingMode: incidentMode,
      specificUserIds: incidentMode === "specific_users" ? incidentSpecificUserIds : [],
      specificRoles: incidentMode === "specific_users" ? incidentSpecificRoles : [],
      priorityUserIds: incidentPriorityUserIds,
      includeViewers: incidentIncludeViewers,
    });
  };

  const showOrgLoading = !user || (profileLoading || (!user.organizationId && !noOrgMessageReady));
  if (showOrgLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading organization…</p>
          </div>
        </main>
        <Footer />
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
                          {orgData?.domain && (
                            <span className="block text-muted-foreground">{orgData.domain}</span>
                          )}
                          {members.length} member{members.length !== 1 ? "s" : ""}
                        </>
                      )}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canInvite && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSetupModalMode("edit");
                        setSetupModalOpen(true);
                      }}
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit organization
                    </Button>
                  )}
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
                  {canInvite && user?.githubConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedGitHubOrgLogin("");
                        setGithubInviteModalOpen(true);
                      }}
                    >
                      <Github className="w-4 h-4 mr-2" />
                      Invite from GitHub org
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Incident notifications (owner/admin only; hide when solo) */}
          {canInvite && !isSolo && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-log-green" />
                  Incident notifications
                </CardTitle>
                <CardDescription>
                  Choose who in the organization receives Sentry and incident alerts. Per-user &quot;Receive incident notifications&quot; in Settings still applies.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Who receives incidents</Label>
                  <RadioGroup
                    value={incidentMode}
                    onValueChange={(v) => setIncidentMode(v as IncidentSettingsPayload["targetingMode"])}
                    className="grid gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="users_with_repos" id="incident-users-with-repos" />
                      <Label htmlFor="incident-users-with-repos" className="font-normal cursor-pointer">Users with repos</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all_members" id="incident-all-members" />
                      <Label htmlFor="incident-all-members" className="font-normal cursor-pointer">All members</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="specific_users" id="incident-specific-users" />
                      <Label htmlFor="incident-specific-users" className="font-normal cursor-pointer">Specific users or roles</Label>
                    </div>
                  </RadioGroup>
                </div>

                {incidentMode === "specific_users" && (
                  <div className="space-y-4 pl-6 border-l-2 border-border">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Roles</Label>
                      <div className="flex flex-wrap gap-4">
                        {ROLE_ORDER.map((role) => (
                          <div key={role} className="flex items-center space-x-2">
                            <Checkbox
                              id={`incident-role-${role}`}
                              checked={incidentSpecificRoles.includes(role)}
                              onCheckedChange={(checked) => {
                                setIncidentSpecificRoles((prev) =>
                                  checked ? [...prev, role] : prev.filter((r) => r !== role)
                                );
                              }}
                            />
                            <Label htmlFor={`incident-role-${role}`} className="font-normal cursor-pointer">{ROLE_LABELS[role]}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Members</Label>
                      <div className="flex flex-wrap gap-3">
                        {sortedMembers.map((m) => (
                          <div key={m.userId} className="flex items-center space-x-2">
                            <Checkbox
                              id={`incident-member-${m.userId}`}
                              checked={incidentSpecificUserIds.includes(m.userId)}
                              onCheckedChange={(checked) => {
                                setIncidentSpecificUserIds((prev) =>
                                  checked ? [...prev, m.userId] : prev.filter((id) => id !== m.userId)
                                );
                              }}
                            />
                            <Label htmlFor={`incident-member-${m.userId}`} className="font-normal cursor-pointer">{m.displayName}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="incident-include-viewers"
                    checked={incidentIncludeViewers}
                    onCheckedChange={(c) => setIncidentIncludeViewers(!!c)}
                  />
                  <Label htmlFor="incident-include-viewers" className="font-normal cursor-pointer">Include viewers</Label>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Notify first (optional)</Label>
                  <p className="text-xs text-muted-foreground">People at the top of this list are notified first. Add members in the order you want.</p>
                  <div className="flex flex-col gap-1">
                    {incidentPriorityUserIds.map((userId, idx) => {
                      const member = sortedMembers.find((m) => m.userId === userId);
                      return (
                        <div key={userId} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 bg-muted/30">
                          <div className="flex items-center gap-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                if (idx > 0) {
                                  const next = [...incidentPriorityUserIds];
                                  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                  setIncidentPriorityUserIds(next);
                                }
                              }}
                              disabled={idx === 0}
                              aria-label="Move up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                if (idx < incidentPriorityUserIds.length - 1) {
                                  const next = [...incidentPriorityUserIds];
                                  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                  setIncidentPriorityUserIds(next);
                                }
                              }}
                              disabled={idx === incidentPriorityUserIds.length - 1}
                              aria-label="Move down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </div>
                          <span className="flex-1 font-medium">{member?.displayName ?? userId}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setIncidentPriorityUserIds((prev) => prev.filter((id) => id !== userId))}
                            aria-label="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                    {sortedMembers.filter((m) => !incidentPriorityUserIds.includes(m.userId)).length > 0 && (
                      <Select
                        value=""
                        onValueChange={(value) => {
                          if (value) setIncidentPriorityUserIds((prev) => [...prev, value]);
                        }}
                      >
                        <SelectTrigger className="w-full max-w-xs">
                          <SelectValue placeholder="Add person to priority list" />
                        </SelectTrigger>
                        <SelectContent>
                          {sortedMembers
                            .filter((m) => !incidentPriorityUserIds.includes(m.userId))
                            .map((m) => (
                              <SelectItem key={m.userId} value={m.userId}>
                                {m.displayName}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <Button
                  onClick={handleSaveIncidentSettings}
                  disabled={saveIncidentSettingsMutation.isPending}
                >
                  {saveIncidentSettingsMutation.isPending ? "Saving…" : "Save incident settings"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Invite modal (owner & admin only) */}
          {canInvite && (
            <>
              <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-log-green" />
                      Invite to organization
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
                        We'll send them a link. They create an account or sign in to join your organization.
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
                          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={revokeInviteLink} disabled={revokeInviteLinkMutation.isPending}>
                            {revokeInviteLinkMutation.isPending ? "Revoking…" : "Revoke link"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Invite from GitHub org modal */}
              <Dialog
                open={githubInviteModalOpen}
                onOpenChange={(open) => {
                  setGithubInviteModalOpen(open);
                }}
              >
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Github className="w-5 h-5 text-log-green" />
                      Invite from GitHub organization
                    </DialogTitle>
                    <DialogDescription>
                      Choose a GitHub org you belong to, see who is not yet in your PushLog organization, then create an invite link to share with them.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>GitHub organization</Label>
                      {githubOrgsLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground py-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading…
                        </div>
                      ) : githubOrgsErrorState ? (
                        <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">Could not load organizations</p>
                          <p className="mt-1">{githubOrgsError instanceof Error ? githubOrgsError.message : "An error occurred."}</p>
                          <p className="mt-2 text-xs">Reconnect GitHub in Settings to grant organization access.</p>
                          <Link href="/settings">
                            <Button variant="outline" size="sm" className="mt-2">Open Settings</Button>
                          </Link>
                        </div>
                      ) : githubOrgs.length === 0 ? (
                        <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">No organization found</p>
                          <p className="mt-1 text-xs">If you belong to a GitHub organization, try disconnecting and reconnecting your GitHub account in Settings to refresh permissions.</p>
                          <Link href="/settings">
                            <Button variant="outline" size="sm" className="mt-2">Open Settings</Button>
                          </Link>
                        </div>
                      ) : (
                        <Select
                          value={selectedGitHubOrgLogin || ""}
                          onValueChange={(v) => {
                            const login = v || "";
                            setSelectedGitHubOrgLogin(login);
                            if (typeof window !== "undefined" && login) window.localStorage.setItem(GITHUB_ORG_STORAGE_KEY, login);
                          }}
                        >
                          <SelectTrigger className="border-border/50">
                            <SelectValue placeholder="Select an organization" />
                          </SelectTrigger>
                          <SelectContent>
                            {githubOrgs.map((org) => (
                              <SelectItem key={org.id} value={org.login}>
                                {org.login}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {selectedGitHubOrgLogin && (
                      <>
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                          <Label className="text-muted-foreground">Role for new members</Label>
                          <Select value={githubInviteRole} onValueChange={setGithubInviteRole}>
                            <SelectTrigger className="w-[130px] border-border/50">
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
                            className="border-border/50"
                            disabled={createInviteLinkMutation.isPending}
                            onClick={() => createInviteLinkMutation.mutate({ role: githubInviteRole, expiresInDays: 7 })}
                          >
                            {createInviteLinkMutation.isPending ? "Creating…" : "Create invite link"}
                          </Button>
                        </div>
                        <div className="space-y-2 pt-5">
                          <Label>Members</Label>
                          {githubOrgMembersLoading ? (
                            <div className="flex items-center gap-2 text-muted-foreground py-4">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Loading members…
                            </div>
                          ) : (
                            <div className="max-h-56 overflow-y-auto rounded-md border border-border/50 p-2 space-y-1">
                              {githubOrgMembers.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">No members returned.</p>
                              ) : (
                                githubOrgMembers.map((m) => (
                                  <div key={m.id} className="flex items-center justify-between gap-2 text-sm py-2 px-2 rounded hover:bg-muted/50">
                                    <span className="font-medium shrink-0">{m.login}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {m.inPushLogOrg ? (
                                        <>
                                          <Badge variant="secondary" className="text-xs">Already in PushLog</Badge>
                                          {m.pushlogRole && (
                                            <span className="text-muted-foreground text-xs">{ROLE_LABELS[m.pushlogRole] ?? m.pushlogRole}</span>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <Badge variant="outline" className="text-xs text-muted-foreground border-border/50">Not in PushLog</Badge>
                                          <Button
                                            type="button"
                                            variant="default"
                                            size="sm"
                                            className="h-7 text-xs"
                                            disabled={sendingInviteToLogin !== null}
                                            onClick={() => sendGitHubMemberInviteMutation.mutate({ githubLogin: m.login, role: githubInviteRole })}
                                          >
                                            {sendingInviteToLogin === m.login ? (
                                              <>
                                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                Sending…
                                              </>
                                            ) : (
                                              <>
                                                <Mail className="w-3 h-3 mr-1" />
                                                Send invite
                                              </>
                                            )}
                                          </Button>
                                          <button
                                            type="button"
                                            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                                            disabled={createInviteLinkMutation.isPending}
                                            onClick={() => copyInviteLinkForGitHubMember(m.login)}
                                          >
                                            Copy link instead
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        {inviteLink && (
                          <div className="space-y-2 pt-2 border-t border-border/50">
                            <Label className="text-muted-foreground">Share this link with GitHub org members</Label>
                            <div className="flex gap-2 items-center">
                              <Input readOnly value={inviteLink} className="font-mono text-xs flex-1 border-border/50" />
                              <Button
                                variant="outline"
                                size="icon"
                                className="border-border/50"
                                title="Copy link"
                                onClick={() => {
                                  navigator.clipboard.writeText(inviteLink);
                                  toast({ title: "Copied", description: "Invite link copied to clipboard." });
                                }}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">Link expires in 7 days. Anyone with the link can join as {ROLE_LABELS[githubInviteRole]}.</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}

          {/* Remove member confirmation */}
          <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove from organization?</AlertDialogTitle>
                <AlertDialogDescription>
                  {memberToRemove && (
                    <>
                      <strong>{memberToRemove.displayName}</strong> will lose access to this organization. Their account
                      will not be deleted—they can be invited again later.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => memberToRemove && removeMemberMutation.mutate(memberToRemove.userId)}
                  disabled={removeMemberMutation.isPending}
                >
                  {removeMemberMutation.isPending ? "Removing…" : "Remove from organization"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Member detail modal (owner/admin only) */}
          {canInvite && (
            <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
              <DialogContent
                className="max-w-md"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {selectedMember && (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <span>{selectedMember.displayName}</span>
                        {selectedMember.userId === String(currentUserId) && (
                          <span className="text-muted-foreground font-normal text-sm">(you)</span>
                        )}
                      </DialogTitle>
                      <DialogDescription>
                        Member details and actions. Remove revokes access only—their account stays.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <dl className="grid gap-3 text-sm">
                        <div>
                          <dt className="text-muted-foreground">Name</dt>
                          <dd className="font-medium text-foreground">{selectedMember.displayName}</dd>
                        </div>
                        {selectedMember.username != null && selectedMember.username !== "" && (
                          <div>
                            <dt className="text-muted-foreground">Username</dt>
                            <dd className="font-mono text-foreground">{selectedMember.username}</dd>
                          </div>
                        )}
                        {selectedMember.email != null && selectedMember.email !== "" && (
                          <div>
                            <dt className="text-muted-foreground">Email</dt>
                            <dd className="font-mono text-foreground break-all">{selectedMember.email}</dd>
                          </div>
                        )}
                        {selectedMember.joinedAt && (
                          <div>
                            <dt className="text-muted-foreground">Joined</dt>
                            <dd className="text-foreground">{formatLocalDate(selectedMember.joinedAt)}</dd>
                          </div>
                        )}
                        {(selectedMember.inviteType === "link" || selectedMember.inviteType === "email") && (
                          <div>
                            <dt className="text-muted-foreground">Joined via</dt>
                            <dd className="text-foreground">{selectedMember.inviteType === "link" ? "Invite link" : "Email invite"}</dd>
                          </div>
                        )}
                        {selectedMember.invitedAt && (
                          <div>
                            <dt className="text-muted-foreground">Invitation sent</dt>
                            <dd className="text-foreground">{formatLocalDateTime(selectedMember.invitedAt)}</dd>
                          </div>
                        )}
                        {selectedMember.inviteUsedAt && (
                          <div>
                            <dt className="text-muted-foreground">Invite used</dt>
                            <dd className="text-foreground">{formatLocalDateTime(selectedMember.inviteUsedAt)}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-muted-foreground">Last active</dt>
                          <dd className="text-foreground">
                            {selectedMember.lastActiveAt ? formatLocalDateTime(selectedMember.lastActiveAt) : "Never"}
                          </dd>
                        </div>
                      </dl>
                      {selectedMember.userId !== String(currentUserId) && (
                        <div className="flex flex-col gap-3 pt-2 border-t border-border">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-muted-foreground">Role</span>
                            <Select
                              value={selectedMember.role}
                              onValueChange={(role) => {
                                updateRoleMutation.mutate({ userId: selectedMember.userId, role });
                                setSelectedMember((m) => (m ? { ...m, role } : null));
                              }}
                              disabled={updateRoleMutation.isPending}
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder="Change role" />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_ORDER.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {ROLE_LABELS[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive w-fit"
                            onClick={() => {
                              setMemberToRemove({ userId: selectedMember.userId, displayName: selectedMember.displayName });
                              setSelectedMember(null);
                            }}
                            disabled={removeMemberMutation.isPending}
                          >
                            <UserMinus className="w-4 h-4 mr-2" />
                            Remove from organization
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>
          )}

          {/* Setup / Edit organization modal */}
          {orgData && (
            <SetupOrganizationModal
              open={setupModalOpen}
              onOpenChange={setSetupModalOpen}
              orgId={orgData.id}
              initialName={orgData.name}
              initialDomain={orgData.domain ?? undefined}
              mode={setupModalMode}
              onSuccess={handleSetupSuccess}
              onSkip={setupModalMode === "setup" ? handleSetupSuccess : undefined}
            />
          )}

          {/* Members */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-log-green" />
                Members
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
                  {sortedMembers.map((member) => {
                    const isYou = member.userId === String(currentUserId);
                    return (
                    <div
                      key={member.userId}
                      role={canInvite ? "button" : undefined}
                      tabIndex={canInvite ? 0 : undefined}
                      onClick={canInvite ? () => {
                        setSelectedMember(member);
                        queryClient.refetchQueries({ queryKey: ORG_MEMBERS_QUERY_KEY });
                      } : undefined}
                      onKeyDown={canInvite ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedMember(member);
                          queryClient.refetchQueries({ queryKey: ORG_MEMBERS_QUERY_KEY });
                        }
                      } : undefined}
                      className={`flex items-center gap-4 p-4 rounded-lg border bg-card outline-none focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 ${
                        isYou
                          ? "border-2 border-log-green"
                          : "border border-border"
                      } ${canInvite ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                    >
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {member.displayName}
                          {isYou && (
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
                      {canInvite && (
                        <span className="text-muted-foreground shrink-0" aria-hidden>
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      )}
                    </div>
                    );
                  })}
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
