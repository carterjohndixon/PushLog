import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

/** How long (ms) to keep showing "in progress" locally after clicking Promote,
 *  even if remote status can't confirm it (e.g. prod doesn't have status endpoint yet). */
const LOCAL_PROMOTE_TTL = 120_000; // 2 minutes

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Local tracking: when did we last click promote?
  const [localPromoteAt, setLocalPromoteAt] = useState<number | null>(null);
  const prevRemoteSha = useRef<string | null>(null);

  const { data, isLoading, error } = useQuery<AdminStatus>({
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
    refetchInterval: (query) => {
      const current = query.state.data;
      const remoteRunning = current?.promoteRemoteStatus?.inProgress;
      const localRunning = localPromoteAt && Date.now() - localPromoteAt < LOCAL_PROMOTE_TTL;
      return remoteRunning || localRunning ? 3000 : 10000;
    },
  });

  // Detect when promotion finishes: remote SHA changes or lock disappears after we started
  useEffect(() => {
    if (!localPromoteAt || !data) return;

    const remote = data.promoteRemoteStatus;
    const remoteAvailable = remote && !remote.error;

    if (remoteAvailable) {
      // Remote status is available — trust it
      if (remote.inProgress === false) {
        // Check if SHA changed (promotion completed)
        const newSha = remote.prodDeployedSha || data.prodDeployedSha;
        if (newSha && newSha !== prevRemoteSha.current) {
          toast({ title: "Promotion complete", description: `Deployed SHA: ${newSha.slice(0, 10)}` });
        }
        setLocalPromoteAt(null);
      }
    } else {
      // Remote status unavailable (prod on old code) — use timer
      if (Date.now() - localPromoteAt > LOCAL_PROMOTE_TTL) {
        setLocalPromoteAt(null);
      }
    }
  }, [data, localPromoteAt, toast]);

  // Track initial SHA so we can detect changes
  useEffect(() => {
    if (data && !prevRemoteSha.current) {
      prevRemoteSha.current =
        data.promoteRemoteStatus?.prodDeployedSha || data.prodDeployedSha || null;
    }
  }, [data]);

  const promoteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/staging/promote", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
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
      toast({
        title: "Promotion started",
        description: "Production promotion is running now.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staging/status"] });
    },
    onError: (e: Error) => {
      toast({
        title: "Promotion failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  // Determine if promotion is running from any source
  const remoteInProgress = data?.promoteRemoteStatus?.inProgress === true;
  const localInProgress = Boolean(localPromoteAt && Date.now() - localPromoteAt < LOCAL_PROMOTE_TTL);
  const isPromotionRunning = remoteInProgress || localInProgress || data?.promoteInProgress === true;

  const remoteStatusAvailable = data?.promoteRemoteStatus && !data.promoteRemoteStatus.error;
  const promoteLogTail = (data?.promoteRemoteStatus?.recentLogLines || []).slice(-12);

  // Estimate progress step from last log line
  const getProgressStep = useCallback((): string => {
    if (!isPromotionRunning) return "";
    const lastLine = promoteLogTail[promoteLogTail.length - 1] || "";
    if (lastLine.includes("completed")) return "Completed!";
    if (lastLine.includes("Restarting")) return "Restarting PM2...";
    if (lastLine.includes("Building")) return "Building production bundle...";
    if (lastLine.includes("Installing")) return "Installing dependencies...";
    if (lastLine.includes("Starting")) return "Starting promotion...";
    return "Running...";
  }, [isPromotionRunning, promoteLogTail]);

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
            <Card>
              <CardHeader>
                <CardTitle>Environment</CardTitle>
                <CardDescription>Current staging app state.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><strong>App env:</strong> {data.appEnv}</p>
                <p><strong>Branch:</strong> {data.branch}</p>
                <p><strong>Staging HEAD:</strong> <code>{data.headSha}</code></p>
                <p><strong>Last deployed prod SHA:</strong> <code>{data.prodDeployedSha || "unknown (first run)"}</code></p>
                <p><strong>Last deployed prod at:</strong> {data.prodDeployedAt || "unknown"}</p>
                <p className="flex items-center gap-2">
                  <strong>Pending commits:</strong>
                  <Badge variant={data.pendingCount > 0 ? "default" : "secondary"}>{data.pendingCount}</Badge>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Approve Production Promotion</CardTitle>
                <CardDescription>
                  Build production bundle and restart <code>pushlog-prod</code> via secured webhook.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => promoteMutation.mutate()}
                  disabled={!data.promoteAvailable || isPromotionRunning || promoteMutation.isPending}
                >
                  {isPromotionRunning || promoteMutation.isPending
                    ? "Promotion in progress..."
                    : "Approve & Promote to Production"}
                </Button>

                {!data.promoteAvailable && (
                  <p className="text-sm text-red-600 mt-3">
                    Production promotion is not configured yet.
                    {!data.promoteConfig?.webhookUrlConfigured ? " Missing PROMOTE_PROD_WEBHOOK_URL." : ""}
                    {!data.promoteConfig?.webhookSecretConfigured ? " Missing PROMOTE_PROD_WEBHOOK_SECRET." : ""}
                  </p>
                )}

                {/* Live progress panel */}
                {isPromotionRunning && (
                  <div className="mt-4 rounded border border-border p-4 bg-muted/20 text-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                      </span>
                      <p className="font-medium">
                        Production promotion is running
                        {remoteStatusAvailable ? ` — ${getProgressStep()}` : "..."}
                      </p>
                    </div>

                    {data.promoteRemoteStatus?.lock?.startedAt && (
                      <p className="text-muted-foreground">
                        Started: {new Date(data.promoteRemoteStatus.lock.startedAt).toLocaleString()}
                        {data.promoteRemoteStatus.lock.by ? ` by ${data.promoteRemoteStatus.lock.by}` : ""}
                      </p>
                    )}

                    {remoteStatusAvailable && promoteLogTail.length > 0 && (
                      <pre className="text-xs whitespace-pre-wrap break-words max-h-56 overflow-auto rounded bg-background p-2 border border-border font-mono">
{promoteLogTail.join("\n")}
                      </pre>
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

            <Card>
              <CardHeader>
                <CardTitle>Commits Pending for Prod</CardTitle>
                <CardDescription>Commits on staging HEAD not yet promoted to production.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.pendingCommits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending commits.</p>
                ) : (
                  data.pendingCommits.map((c) => (
                    <div key={c.sha} className="rounded border border-border p-3 text-sm">
                      <p className="font-medium">{c.subject}</p>
                      <p className="text-muted-foreground">
                        {c.shortSha} • {c.author} • {new Date(c.dateIso).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </main>
    </div>
  );
}
