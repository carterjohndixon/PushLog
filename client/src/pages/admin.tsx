import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, ArrowUp, RotateCcw, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CommitInfo = {
  sha: string;
  shortSha: string;
  dateIso: string;
  author: string;
  subject: string;
};

type RemoteStatus = {
  inProgress?: boolean;
  lock?: { startedAt?: string; by?: string; [k: string]: any } | null;
  recentLogLines?: string[];
  prodDeployedSha?: string | null;
  prodDeployedAt?: string | null;
  error?: string;
};

type AdminStatus = {
  appEnv: string;
  branch: string;
  headSha: string;
  prodDeployedSha: string | null;
  prodDeployedAt: string | null;
  pendingCount: number;
  promoteInProgress: boolean;
  promoteScriptExists: boolean;
  promoteViaWebhook: boolean;
  promoteAvailable: boolean;
  promoteConfig: {
    webhookUrlConfigured: boolean;
    webhookSecretConfigured: boolean;
  };
  promoteRemoteStatus?: RemoteStatus | null;
  recentCommits: CommitInfo[];
  pendingCommits: CommitInfo[];
};

const LOCAL_PROMOTE_TTL = 120_000;

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [localPromoteAt, setLocalPromoteAt] = useState<number | null>(null);
  const [forceInProgress, setForceInProgress] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);
  const [deployTarget, setDeployTarget] = useState<CommitInfo | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const prevRemoteSha = useRef<string | null>(null);

  const { data: rawData, isLoading, error } = useQuery<AdminStatus>({
    queryKey: ["/api/admin/staging/status"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/staging/status?t=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load admin status");
      }
      return res.json();
    },
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const current = query.state.data;
      const remoteRunning = current?.promoteRemoteStatus?.inProgress;
      const localRunning = localPromoteAt && Date.now() - localPromoteAt < LOCAL_PROMOTE_TTL;
      return remoteRunning || localRunning ? 3000 : 10000;
    },
  });

  // Hold onto last good promoteRemoteStatus and recentCommits when fetches intermittently fail
  const lastGoodRemoteRef = useRef<RemoteStatus | null>(null);
  const lastGoodCommitsRef = useRef<CommitInfo[] | null>(null);
  if (rawData?.promoteRemoteStatus && !rawData.promoteRemoteStatus.error) {
    lastGoodRemoteRef.current = rawData.promoteRemoteStatus;
  }
  if (rawData?.recentCommits && rawData.recentCommits.length > 0) {
    lastGoodCommitsRef.current = rawData.recentCommits;
  }
  const data = useMemo((): AdminStatus | undefined => {
    if (!rawData) return undefined;
    let patched = rawData;
    // Preserve last good remote status
    const remote = rawData.promoteRemoteStatus;
    const hasError = remote?.error;
    const fallback = lastGoodRemoteRef.current;
    if (hasError && fallback) {
      patched = { ...patched, promoteRemoteStatus: fallback };
    }
    // Preserve last good commit list — never replace good data with empty
    if (patched.recentCommits.length === 0 && lastGoodCommitsRef.current) {
      patched = { ...patched, recentCommits: lastGoodCommitsRef.current };
    }
    return patched;
  }, [rawData]);

  useEffect(() => {
    if (!localPromoteAt || !data) return;
    const remote = data.promoteRemoteStatus;
    const remoteAvailable = remote && !remote.error;
    if (remoteAvailable) {
      if (remote.inProgress === false) {
        const newSha = remote.prodDeployedSha || data.prodDeployedSha;
        if (newSha && newSha !== prevRemoteSha.current) {
          toast({ title: "Promotion complete", description: `Deployed SHA: ${newSha.slice(0, 10)}` });
        }
        setLocalPromoteAt(null);
        // Force immediate refetch to ensure we have the latest deployed SHA (avoids race with file write)
        queryClient.invalidateQueries({ queryKey: ["/api/admin/staging/status"] });
      }
    } else {
      if (Date.now() - localPromoteAt > LOCAL_PROMOTE_TTL) {
        setLocalPromoteAt(null);
      }
    }
  }, [data, localPromoteAt, toast, queryClient]);

  useEffect(() => {
    if (data && !prevRemoteSha.current) {
      prevRemoteSha.current =
        data.promoteRemoteStatus?.prodDeployedSha || data.prodDeployedSha || null;
    }
  }, [data]);

  // ── Promote mutation ──
  const promoteMutation = useMutation({
    mutationFn: async (args: { sha: string; isRollback?: boolean }) => {
      const res = await fetch("/api/admin/staging/promote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ headSha: args.sha, isRollback: args.isRollback ?? false }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to start promotion");
      }
      return res.json();
    },
    onSuccess: () => {
      prevRemoteSha.current =
        data?.promoteRemoteStatus?.prodDeployedSha || data?.prodDeployedSha || null;
      setLocalPromoteAt(Date.now());
      setForceInProgress(false);
      setLogsOpen(true);
      toast({ title: "Promotion started", description: "Production promotion is running now." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staging/status"] });
    },
    onError: (e: Error) => {
      if (e.message.toLowerCase().includes("already in progress")) {
        // If backend reports an active promotion, immediately reflect that in UI
        // so admin can see/click Cancel while status polling catches up.
        setForceInProgress(true);
        setLocalPromoteAt(Date.now());
      }
      toast({ title: "Promotion failed", description: e.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staging/status"] });
    },
  });

  // ── Cancel mutation ──
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/staging/cancel-promote", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to cancel promotion");
      }
      return res.json();
    },
    onSuccess: () => {
      setLocalPromoteAt(null);
      setForceInProgress(false);
      toast({ title: "Promotion cancelled", description: "The deployment has been stopped." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staging/status"] });
    },
    onError: (e: Error) => {
      toast({ title: "Cancel failed", description: e.message, variant: "destructive" });
    },
  });

  // ── Derived state ──
  const remoteInProgress = data?.promoteRemoteStatus?.inProgress === true;
  const localInProgress = Boolean(localPromoteAt && Date.now() - localPromoteAt < LOCAL_PROMOTE_TTL);

  const remoteStatusAvailable = data?.promoteRemoteStatus && !data.promoteRemoteStatus.error;
  const promoteLogTail = (data?.promoteRemoteStatus?.recentLogLines || []).slice(-12);
  const lastLogLine = promoteLogTail[promoteLogTail.length - 1] || "";
  const promotionFinishedFromLogs =
    lastLogLine.includes("Production promotion completed.") || lastLogLine.includes("Promotion CANCELLED");
  const isPromotionRunning =
    (remoteInProgress || localInProgress || data?.promoteInProgress === true || forceInProgress) && !promotionFinishedFromLogs;

  useEffect(() => {
    if (promotionFinishedFromLogs && localPromoteAt) {
      setLocalPromoteAt(null);
      setForceInProgress(false);
    }
  }, [promotionFinishedFromLogs, localPromoteAt]);

  const showLogsPanel = isPromotionRunning || (remoteStatusAvailable && promoteLogTail.length > 0);

  const getProgressStep = useCallback((): string => {
    const lastLine = lastLogLine;
    if (lastLine.includes("Production promotion completed.")) return "Completed!";
    if (lastLine.includes("Promotion CANCELLED")) return "Cancelled";
    if (!isPromotionRunning) return "";
    if (lastLine.includes("Restarting")) return "Restarting PM2...";
    if (lastLine.includes("Building production bundle")) return "Building production bundle...";
    if (lastLine.includes("Building incident-engine")) return "Building Rust engines...";
    if (lastLine.includes("Installing dependencies")) return "Installing dependencies...";
    if (lastLine.includes("Checking package")) return "Checking packages...";
    if (lastLine.includes("Packages unchanged") || lastLine.includes("Lockfile unchanged")) return "Packages unchanged, skipping install";
    if (lastLine.includes("Packages changed") || lastLine.includes("will install")) return "Packages changed, preparing install";
    if (lastLine.includes("Starting")) return "Starting promotion...";
    return "Running...";
  }, [isPromotionRunning, lastLogLine]);

  // ── Commit classification helpers ──
  const prodSha = data?.promoteRemoteStatus?.prodDeployedSha || data?.prodDeployedSha || null;

  /** Build a set of pending SHAs for quick lookup */
  const pendingShaSet = new Set((data?.pendingCommits || []).map((c) => c.sha));

  /** Classify a commit relative to deployed prod SHA */
  function commitStatus(c: CommitInfo): "deployed" | "pending" | "old" {
    if (prodSha && c.sha === prodSha) return "deployed";
    if (pendingShaSet.has(c.sha)) return "pending";
    return "old";
  }

  return (
    <div className="min-h-screen bg-forest-gradient">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-graphite">Staging Admin</h1>
          <p className="text-steel-gray mt-2">
            Review staged commits and approve production promotion.
          </p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-6">Loading admin status...</CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-6 text-red-600">
              {error instanceof Error ? error.message : "Failed to load admin status."}
            </CardContent>
          </Card>
        ) : data ? (
          <div className="space-y-6">
            {/* ── Environment ── */}
            <Card>
              <CardHeader>
                <CardTitle>Environment</CardTitle>
                <CardDescription>Current staging app state.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><strong>App env:</strong> {data.appEnv}</p>
                <p><strong>Branch:</strong> {data.branch}</p>
                <p><strong>Staging HEAD:</strong> <code>{data.headSha}</code></p>
                <p><strong>Last deployed prod SHA:</strong> <code>{prodSha || "unknown (first run)"}</code></p>
                <p><strong>Last deployed prod at:</strong> {data.promoteRemoteStatus?.prodDeployedAt || data.prodDeployedAt || "unknown"}</p>
                <p className="flex items-center gap-2">
                  <strong>Pending commits:</strong>
                  <Badge variant={data.pendingCount > 0 ? "default" : "secondary"}>{data.pendingCount}</Badge>
                </p>
              </CardContent>
            </Card>

            {/* ── Promote / Cancel ── */}
            <Card>
              <CardHeader>
                <CardTitle>Approve Production Promotion</CardTitle>
                <CardDescription>
                  Build production bundle and restart <code>pushlog-prod</code> via secured webhook.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={async () => {
                      try {
                        // Refetch status first so we deploy the true latest, not stale headSha
                        const fresh = await queryClient.fetchQuery({
                          queryKey: ["/api/admin/staging/status"],
                          queryFn: async () => {
                            const res = await fetch(`/api/admin/staging/status?t=${Date.now()}`, {
                              credentials: "include",
                              cache: "no-store",
                              headers: { Accept: "application/json" },
                            });
                            if (!res.ok) {
                              const body = await res.json().catch(() => ({}));
                              throw new Error(body.error || "Failed to fetch status");
                            }
                            return res.json();
                          },
                        });
                        const sha = fresh?.headSha ?? fresh?.recentCommits?.[0]?.sha ?? data?.headSha ?? "";
                        if (!sha) {
                          toast({ title: "Cannot deploy", description: "No branch tip available. Refresh the page.", variant: "destructive" });
                          return;
                        }
                        promoteMutation.mutate({ sha, isRollback: false });
                      } catch (e) {
                        toast({ title: "Failed to refresh status", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
                      }
                    }}
                    disabled={!data.promoteAvailable || isPromotionRunning || promoteMutation.isPending}
                  >
                    {isPromotionRunning || promoteMutation.isPending
                      ? "Promotion in progress..."
                      : "Approve & Promote to Production"}
                  </Button>

                  {isPromotionRunning && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                    >
                      {cancelMutation.isPending ? "Cancelling..." : "Cancel Deployment"}
                    </Button>
                  )}
                </div>

                {!data.promoteAvailable && (
                  <p className="text-sm text-red-600 mt-3">
                    Production promotion is not configured yet.
                    {!data.promoteConfig?.webhookUrlConfigured ? " Missing PROMOTE_PROD_WEBHOOK_URL." : ""}
                    {!data.promoteConfig?.webhookSecretConfigured ? " Missing PROMOTE_PROD_WEBHOOK_SECRET." : ""}
                  </p>
                )}

                {/* Live progress panel (shows during promotion and after completion) */}
                {showLogsPanel && (
                  <div className="mt-4 rounded border border-border p-4 bg-muted/20 text-sm space-y-3">
                    <div className="flex items-center gap-2">
                      {isPromotionRunning ? (
                        <>
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                          </span>
                          <p className="font-medium">
                            {data.promoteRemoteStatus?.lock?.isRollback ? "Rollback" : "Deployment"} in progress
                            {data.promoteRemoteStatus?.lock?.targetSha
                              ? (() => {
                                  const c = data.recentCommits.find((x) => x.sha === data.promoteRemoteStatus?.lock?.targetSha);
                                  const commitLabel = c ? `${c.shortSha}: ${c.subject}` : data.promoteRemoteStatus.lock.targetSha.slice(0, 12);
                                  const step = remoteStatusAvailable ? getProgressStep() : "";
                                  return ` — ${commitLabel}${step ? ` (${step})` : ""}`;
                                })()
                              : remoteStatusAvailable ? ` — ${getProgressStep()}` : "..."}
                          </p>
                        </>
                      ) : (
                        <>
                          <span className="flex h-2.5 w-2.5 rounded-full bg-green-500" />
                          <p className="font-medium">
                            Last promotion {getProgressStep() ? `— ${getProgressStep()}` : ""}
                          </p>
                        </>
                      )}
                    </div>

                    {isPromotionRunning && data.promoteRemoteStatus?.lock?.targetSha && (
                      <div className="rounded border border-border bg-background/50 px-3 py-2">
                        <p className="text-xs text-muted-foreground mb-0.5">Deploying commit</p>
                        <p className="font-mono text-xs font-medium">
                          {(() => {
                            const c = data.recentCommits.find((x) => x.sha === data.promoteRemoteStatus?.lock?.targetSha);
                            return c ? `${c.shortSha} — ${c.subject}` : data.promoteRemoteStatus.lock.targetSha.slice(0, 12);
                          })()}
                        </p>
                      </div>
                    )}

                    {data.promoteRemoteStatus?.lock?.startedAt && (
                      <p className="text-muted-foreground">
                        Started: {new Date(data.promoteRemoteStatus.lock.startedAt).toLocaleString()}
                        {data.promoteRemoteStatus.lock.by ? ` by ${data.promoteRemoteStatus.lock.by}` : ""}
                      </p>
                    )}

                    {remoteStatusAvailable && promoteLogTail.length > 0 && (
                      <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-2 -ml-1 text-muted-foreground hover:text-foreground">
                            {logsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            {logsOpen ? "Hide logs" : "Show logs"}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre className="text-xs whitespace-pre-wrap break-words max-h-56 overflow-auto rounded bg-background p-2 border border-border font-mono mt-2">
                            {promoteLogTail.join("\n")}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {!remoteStatusAvailable && (
                      <p className="text-xs text-muted-foreground">
                        Live log streaming will be available after this promotion deploys the status endpoint to production.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Commit Timeline ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle>Commit History</CardTitle>
                  {data.recentCommits.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 px-2.5 py-0.5 text-xs font-medium">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                      </span>
                      Live
                    </span>
                  )}
                </div>
                <CardDescription>
                  Recent commits on <code>{data.branch || "main"}</code>.
                  Pending commits are highlighted; the last deployed commit is marked.
                  {data.recentCommits.length > 0 && (
                    <span className="block mt-1 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 align-text-bottom" />
                      {data.recentCommits.length} commits loaded — rollback and deploy work from this list.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.recentCommits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No commit history available. After a rollback, history is loaded from GitHub; it may be temporarily unavailable or rate-limited.
                  </p>
                ) : (
                  <div className="relative">
                    {/* Vertical timeline line */}
                    <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

                    <div className="space-y-0">
                      {data.recentCommits.map((c, i) => {
                        const status = commitStatus(c);
                        const isDeployed = status === "deployed";
                        const isPending = status === "pending";
                        const isHead = i === 0;

                        return (
                          <div key={c.sha} className="relative flex items-start gap-3 py-2 pl-0">
                            {/* Timeline dot */}
                            <div className="relative z-10 mt-1.5 flex-shrink-0">
                              {isDeployed ? (
                                <div className="h-[22px] w-[22px] rounded-full bg-green-500 border-2 border-green-300 flex items-center justify-center">
                                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : isPending ? (
                                <div className="h-[22px] w-[22px] rounded-full bg-amber-500 border-2 border-amber-300" />
                              ) : (
                                <div className="h-[22px] w-[22px] rounded-full bg-muted border-2 border-border" />
                              )}
                            </div>

                            {/* Commit content */}
                            <div
                              className={`flex-1 rounded border p-3 text-sm cursor-pointer transition-colors hover:bg-muted/30 ${
                                isDeployed
                                  ? "border-green-500/40 bg-green-500/5"
                                  : isPending
                                    ? "border-amber-500/40 bg-amber-500/5"
                                    : "border-border bg-transparent opacity-60"
                              }`}
                              onClick={() => setSelectedCommit(c)}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium flex-1 min-w-0">{c.subject}</p>
                                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                  {isHead && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">HEAD</Badge>
                                  )}
                                  {isDeployed && (
                                    <Badge className="bg-green-600 hover:bg-green-600 text-[10px] px-1.5 py-0">DEPLOYED</Badge>
                                  )}
                                  {isPending && (
                                    <Badge className="bg-amber-600 hover:bg-amber-600 text-[10px] px-1.5 py-0">PENDING</Badge>
                                  )}
                                  {data.promoteAvailable && !isPromotionRunning && !promoteMutation.isPending && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs gap-1"
                                      onClick={() => setDeployTarget(c)}
                                    >
                                      {isPending ? (
                                        <><ArrowUp className="h-3 w-3" /> Deploy</>
                                      ) : isDeployed ? (
                                        <><RotateCcw className="h-3 w-3" /> Redeploy</>
                                      ) : (
                                        <><RotateCcw className="h-3 w-3" /> Rollback</>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <p className="text-muted-foreground mt-1">
                                <code className="text-xs">{c.shortSha}</code> &middot; {c.author} &middot; {new Date(c.dateIso).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </main>

      {/* Deploy/Rollback confirmation */}
      <AlertDialog open={!!deployTarget} onOpenChange={(open) => !open && setDeployTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deployTarget && (commitStatus(deployTarget) === "pending" ? "Deploy this commit?" : "Rollback to this commit?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deployTarget && (
                <>
                  {commitStatus(deployTarget) === "pending" ? (
                    <span>Production will be fast-forwarded to <strong>{deployTarget.shortSha}</strong>: {deployTarget.subject}</span>
                  ) : (
                    <span>Production will be rolled back to <strong>{deployTarget.shortSha}</strong>: {deployTarget.subject}</span>
                  )}
                  {" "}The deploy script will check out this commit and rebuild. This may take a few minutes.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deployTarget) {
                  promoteMutation.mutate({ sha: deployTarget.sha, isRollback: commitStatus(deployTarget) === "old" });
                  setDeployTarget(null);
                }
              }}
            >
              Deploy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Commit detail dialog */}
      <Dialog open={!!selectedCommit} onOpenChange={(open) => !open && setSelectedCommit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Commit details</DialogTitle>
          </DialogHeader>
          {selectedCommit && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-1">Full SHA</p>
                <code className="block break-all bg-muted px-2 py-1.5 rounded text-xs">{selectedCommit.sha}</code>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Subject</p>
                <p className="font-medium">{selectedCommit.subject}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Author</p>
                <p>{selectedCommit.author}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Date</p>
                <p>{new Date(selectedCommit.dateIso).toLocaleString()}</p>
              </div>
              <div className="pt-2">
                <p className="text-muted-foreground text-xs mb-1">Status</p>
                <Badge
                  variant={commitStatus(selectedCommit) === "deployed" ? "default" : commitStatus(selectedCommit) === "pending" ? "secondary" : "outline"}
                  className={
                    commitStatus(selectedCommit) === "deployed"
                      ? "bg-green-600 hover:bg-green-600"
                      : commitStatus(selectedCommit) === "pending"
                        ? "bg-amber-600 hover:bg-amber-600"
                        : ""
                  }
                >
                  {commitStatus(selectedCommit) === "deployed" ? "DEPLOYED" : commitStatus(selectedCommit) === "pending" ? "PENDING" : "OLDER"}
                </Badge>
              </div>
              {data?.promoteAvailable && !isPromotionRunning && !promoteMutation.isPending && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1"
                  onClick={() => {
                    setSelectedCommit(null);
                    setDeployTarget(selectedCommit);
                  }}
                >
                  {commitStatus(selectedCommit) === "pending" ? (
                    <><ArrowUp className="h-3 w-3" /> Deploy this commit</>
                  ) : commitStatus(selectedCommit) === "deployed" ? (
                    <><RotateCcw className="h-3 w-3" /> Redeploy</>
                  ) : (
                    <><RotateCcw className="h-3 w-3" /> Rollback to this</>
                  )}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
