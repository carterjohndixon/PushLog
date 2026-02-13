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
  recentCommits: CommitInfo[];
  pendingCommits: CommitInfo[];
};

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<AdminStatus>({
    queryKey: ["/api/admin/staging/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/staging/status", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load admin status");
      }
      return res.json();
    },
    refetchInterval: 10000,
  });

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
                  Runs <code>deploy-production.sh</code> on this server: build production bundle and restart <code>pushlog-prod</code>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => promoteMutation.mutate()}
                  disabled={!data.promoteAvailable || data.promoteInProgress || promoteMutation.isPending}
                >
                  {data.promoteInProgress || promoteMutation.isPending ? "Promotion in progress..." : "Approve & Promote to Production"}
                </Button>
                {!data.promoteAvailable && (
                  <p className="text-sm text-red-600 mt-3">
                    Production promotion is not configured yet.
                    {!data.promoteConfig?.webhookUrlConfigured ? " Missing PROMOTE_PROD_WEBHOOK_URL." : ""}
                    {!data.promoteConfig?.webhookSecretConfigured ? " Missing PROMOTE_PROD_WEBHOOK_SECRET." : ""}
                  </p>
                )}
                {data.promoteViaWebhook && (
                  <p className="text-sm text-muted-foreground mt-3">Promotion runs via secured production webhook.</p>
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
