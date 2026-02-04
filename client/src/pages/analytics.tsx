import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitBranch, Bell, Cpu, Github, Folder, FileCode, TrendingUp } from "lucide-react";
import { getAiModelDisplayName } from "@/lib/utils";
import { formatLocalShortDate } from "@/lib/date";

interface TopRepo {
  repositoryId: number;
  name: string;
  fullName: string;
  pushCount: number;
  totalAdditions: number;
  totalDeletions: number;
}

interface AnalyticsData {
  pushesByDay: { date: string; count: number }[];
  slackMessagesByDay: { date: string; count: number }[];
  aiModelUsage: { model: string; count: number }[];
  topRepos: TopRepo[];
}

interface RepoDetailData {
  repository: { id: number; name: string; fullName: string };
  fileStats: { filePath: string; additions: number; deletions: number }[];
  folderStats: { folder: string; additions: number; deletions: number }[];
}

const chartConfig = {
  count: {
    label: "Count",
    color: "hsl(var(--log-green))",
  },
  date: {
    label: "Date",
  },
};

function formatShortDate(isoDate: string) {
  return formatLocalShortDate(isoDate);
}

export default function Analytics() {
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);

  const { data, isLoading, error, refetch } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
    queryFn: async () => {
      const response = await fetch("/api/analytics", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = body?.error || (response.status === 401 ? "Please log in again." : "Failed to load analytics.");
        throw new Error(msg);
      }
      return body;
    },
  });

  const { data: repoDetail, isLoading: repoDetailLoading } = useQuery<RepoDetailData>({
    queryKey: ["/api/analytics/repos", selectedRepoId],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/repos/${selectedRepoId}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Failed to load repo details");
      return response.json();
    },
    enabled: selectedRepoId != null,
  });

  if (error) {
    const message = error instanceof Error ? error.message : "Failed to load analytics. Please try again.";
    return (
      <div className="min-h-screen bg-forest-gradient">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12 space-y-4">
            <p className="text-destructive">{message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const pushesData = (data?.pushesByDay ?? []).map((d) => ({
    ...d,
    dateLabel: formatShortDate(d.date),
  }));
  const slackData = (data?.slackMessagesByDay ?? []).map((d) => ({
    ...d,
    dateLabel: formatShortDate(d.date),
  }));
  const topRepos = data?.topRepos ?? [];
  const mostUsedModel = data?.aiModelUsage?.[0];

  return (
    <div className="min-h-screen bg-forest-gradient">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-2">
            GitHub pushes, Slack messages, AI model usage, and repo activity
          </p>
        </div>

        {/* Summary: Most used AI model */}
        {mostUsedModel && !isLoading && (
          <Card className="mb-6 border-log-green/30 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-log-green/20 flex items-center justify-center">
                  <Cpu className="w-6 h-6 text-log-green" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Your most used AI model</p>
                  <p className="text-xl font-semibold text-foreground">{getAiModelDisplayName(mostUsedModel.model)}</p>
                  <p className="text-sm text-muted-foreground">{mostUsedModel.count} summaries generated</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Repositories by activity */}
        {topRepos.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <TrendingUp className="w-5 h-5 text-log-green" />
                Top Repositories (by changes)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Click a repo to see lines changed per file and folder
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {topRepos.map((repo) => (
                    <button
                      key={repo.repositoryId}
                      type="button"
                      onClick={() => setSelectedRepoId(repo.repositoryId)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border hover:bg-muted hover:border-log-green/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Github className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground truncate">{repo.fullName}</span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-2">
                        <span className="text-sm text-muted-foreground">{repo.pushCount} pushes</span>
                        <span className="text-sm text-green-600 dark:text-green-400">+{repo.totalAdditions}</span>
                        <span className="text-sm text-red-600 dark:text-red-400">−{repo.totalDeletions}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* GitHub Pushes */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <GitBranch className="w-5 h-5 text-log-green" />
              GitHub Pushes (last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full rounded-lg" />
            ) : (
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <BarChart data={pushesData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--log-green))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Slack Messages Sent */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Bell className="w-5 h-5 text-log-green" />
              Slack Messages Sent (last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full rounded-lg" />
            ) : (
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <BarChart data={slackData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Most Used AI Models */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Cpu className="w-5 h-5 text-log-green" />
              AI Model Usage (all time)
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Tracked per summary so you can see which model you use most
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : !data?.aiModelUsage?.length ? (
              <p className="text-muted-foreground py-4">No AI usage recorded yet. Summaries will be tracked when you push.</p>
            ) : (
              <div className="space-y-2">
                {data.aiModelUsage.map(({ model, count }) => (
                  <div
                    key={model}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                  >
                    <span className="font-medium text-foreground">{getAiModelDisplayName(model)}</span>
                    <span className="text-muted-foreground">{count} summaries</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Repo detail modal */}
      <Dialog open={selectedRepoId != null} onOpenChange={(open) => !open && setSelectedRepoId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="w-5 h-5 text-log-green" />
              {repoDetail?.repository?.fullName ?? "Repository"} — lines changed
            </DialogTitle>
          </DialogHeader>
          {repoDetailLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : repoDetail ? (
            <div className="space-y-6">
              <a
                href={`https://github.com/${repoDetail.repository.fullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-log-green hover:underline inline-flex items-center gap-1"
              >
                View on GitHub <Github className="w-3 h-3" />
              </a>

              {repoDetail.folderStats.length > 0 && (
                <div>
                  <h4 className="font-medium text-foreground flex items-center gap-2 mb-2">
                    <Folder className="w-4 h-4 text-log-green" /> By folder
                  </h4>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                      <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-foreground">Folder</th>
                          <th className="text-right p-2 text-muted-foreground">+ Additions</th>
                          <th className="text-right p-2 text-muted-foreground">− Deletions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repoDetail.folderStats.map(({ folder, additions, deletions }) => (
                          <tr key={folder} className="border-b border-border/50 last:border-0">
                            <td className="p-2 font-mono text-foreground">{folder}</td>
                            <td className="p-2 text-right text-green-600 dark:text-green-400">+{additions}</td>
                            <td className="p-2 text-right text-red-600 dark:text-red-400">−{deletions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {repoDetail.fileStats.length > 0 && (
                <div>
                  <h4 className="font-medium text-foreground flex items-center gap-2 mb-2">
                    <FileCode className="w-4 h-4 text-log-green" /> By file (top 50)
                  </h4>
                  <div className="rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-foreground">File</th>
                          <th className="text-right p-2 text-muted-foreground">+ Additions</th>
                          <th className="text-right p-2 text-muted-foreground">− Deletions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repoDetail.fileStats.slice(0, 50).map(({ filePath, additions, deletions }) => (
                          <tr key={filePath} className="border-b border-border/50 last:border-0">
                            <td className="p-2 font-mono text-foreground truncate max-w-[200px]" title={filePath}>{filePath}</td>
                            <td className="p-2 text-right text-green-600 dark:text-green-400">+{additions}</td>
                            <td className="p-2 text-right text-red-600 dark:text-red-400">−{deletions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {repoDetail.fileStats.length > 50 && (
                    <p className="text-xs text-muted-foreground mt-1">Showing top 50 of {repoDetail.fileStats.length} files</p>
                  )}
                </div>
              )}

              {!repoDetail.fileStats.length && !repoDetail.folderStats.length && (
                <p className="text-muted-foreground py-4">No file-level data yet. Data is recorded when GitHub sends file stats with each push.</p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
