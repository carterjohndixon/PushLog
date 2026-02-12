import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitBranch, Bell, Cpu, Github, Folder, FileCode, TrendingUp, TrendingDown, Activity, Layers, DollarSign, BarChart3 } from "lucide-react";
import { getAiModelDisplayName } from "@/lib/utils";
import { formatLocalShortDate, formatLocalDate } from "@/lib/date";
import { Footer } from "@/components/footer";

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

interface AnalyticsStatsSnapshot {
  id: number;
  userId: number;
  activeIntegrations: number;
  totalRepositories: number;
  dailyPushes: number;
  totalNotifications: number;
  createdAt: string;
}

interface StatsResponse {
  latest: AnalyticsStatsSnapshot;
  trend: {
    dailyPushes: number;
    totalNotifications: number;
    activeIntegrations: number;
    totalRepositories: number;
  } | null;
  history: AnalyticsStatsSnapshot[];
}

interface CostData {
  totalSpend: number;
  totalSpendFormatted: string;
  totalCalls: number;
  dailyCost: { date: string; totalCost: number; callCount: number }[];
  costByModel: { model: string; cost: number; calls: number; tokens: number }[];
}

interface RepoDetailData {
  repository: { id: number; name: string; fullName: string };
  fileStats: { filePath: string; additions: number; deletions: number }[];
  folderStats: { folder: string; additions: number; deletions: number }[];
}

const chartConfig = {
  count: { label: "Count", color: "hsl(var(--log-green))" },
  date: { label: "Date" },
};

const PIE_COLORS = [
  "hsl(var(--log-green))",
  "hsl(var(--accent))",
  "hsl(142 60% 45%)",
  "hsl(160 50% 50%)",
  "hsl(180 40% 45%)",
  "hsl(200 50% 50%)",
  "hsl(220 45% 55%)",
  "hsl(260 40% 55%)",
];

function formatShortDate(isoDate: string) {
  return formatLocalShortDate(isoDate);
}

/** Last 30 calendar days (YYYY-MM-DD), oldest first, for trend charts. */
function getLast30DayDates(): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 29; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(x.getDate() - i);
    const y = x.getFullYear(), m = x.getMonth() + 1, day = x.getDate();
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return out;
}

function TrendBadge({ value, label }: { value: number; label?: string }) {
  if (value === 0) return null;
  const isUp = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? "+" : ""}{value}{label ? ` ${label}` : ""}
    </span>
  );
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

  const { data: statsData, isLoading: statsLoading } = useQuery<StatsResponse>({
    queryKey: ["/api/analytics/stats"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
  });

  const { data: costData, isLoading: costLoading } = useQuery<CostData>({
    queryKey: ["/api/analytics/cost"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/cost", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load cost data");
      return res.json();
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
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12 space-y-4">
            <p className="text-destructive">{message}</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const pushesData = (data?.pushesByDay ?? []).map((d) => ({ ...d, dateLabel: formatShortDate(d.date) }));
  const slackData = (data?.slackMessagesByDay ?? []).map((d) => ({ ...d, dateLabel: formatShortDate(d.date) }));
  const topRepos = data?.topRepos ?? [];
  const latest = statsData?.latest;
  const trend = statsData?.trend;
  const pushesByDay = data?.pushesByDay ?? [];
  const slackByDay = data?.slackMessagesByDay ?? [];
  const activityTrendData = getLast30DayDates().map((date) => ({
    date: formatShortDate(date),
    dateRaw: date,
    dateExact: formatLocalDate(date),
    pushes: pushesByDay.find((p) => p.date === date)?.count ?? 0,
    notifications: slackByDay.find((s) => s.date === date)?.count ?? 0,
  }));
  const dailyCostData = (costData?.dailyCost ?? []).map(d => ({
    ...d,
    dateLabel: formatShortDate(d.date),
    costUsd: d.totalCost / 10000,
  }));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-log-green" />
            Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Activity overview, push trends, AI costs, and repository insights.
          </p>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {statsLoading ? (
            <>
              {[1, 2, 3, 4].map(i => (
                <Card key={i} className="border-border">
                  <CardContent className="pt-5 pb-4">
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </>
          ) : latest ? (
            <>
              <Card className="border-border">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-4 h-4 text-log-green" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Integrations</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{latest.activeIntegrations}</p>
                  {trend && <TrendBadge value={trend.activeIntegrations} />}
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-4 h-4 text-log-green" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Repositories</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{latest.totalRepositories}</p>
                  {trend && <TrendBadge value={trend.totalRepositories} />}
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch className="w-4 h-4 text-log-green" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Pushes (24h)</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{latest.dailyPushes}</p>
                  {trend && <TrendBadge value={trend.dailyPushes} />}
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Bell className="w-4 h-4 text-log-green" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Notifications</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{latest.totalNotifications}</p>
                  {trend && <TrendBadge value={trend.totalNotifications} />}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* Activity trends: last 30 days from push and Slack data (one point per calendar day) */}
        {activityTrendData.length > 0 && (
          <Card className="card-lift mb-8 border-border shadow-forest">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <TrendingUp className="w-5 h-5 text-log-green" />
                Activity Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[240px] w-full">
                <LineChart data={activityTrendData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickLine={false}
                    tickFormatter={(value, index) => {
                      const d = activityTrendData[index];
                      if (!d?.dateRaw) return value;
                      const day = new Date(d.dateRaw + "T12:00:00").getDay();
                      return day === 0 ? value : "";
                    }}
                  />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.dateExact ?? ""}
                      />
                    }
                  />
                  <Line type="monotone" dataKey="pushes" name="Daily Pushes" stroke="hsl(var(--log-green))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="notifications" name="Daily Notifications" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* AI Cost Breakdown */}
        {costData && (costData.totalCalls > 0 || !costLoading) && costData.totalCalls > 0 && (
          <Card className="card-lift mb-8 border-border shadow-forest">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <DollarSign className="w-5 h-5 text-log-green" />
                AI Cost Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Spend</p>
                  <p className="text-xl font-semibold text-foreground">{costData.totalSpendFormatted}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Calls</p>
                  <p className="text-xl font-semibold text-foreground">{costData.totalCalls}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg per Call</p>
                  <p className="text-xl font-semibold text-foreground">
                    {costData.totalCalls > 0 ? `$${(costData.totalSpend / costData.totalCalls / 10000).toFixed(4)}` : "—"}
                  </p>
                </div>
              </div>

              {/* Daily cost area chart */}
              {dailyCostData.some(d => d.costUsd > 0) && (
                <div className="mb-6">
                  <p className="text-sm font-medium text-foreground mb-3">Daily spend (last 30 days)</p>
                  <ChartContainer config={chartConfig} className="h-[200px] w-full">
                    <AreaChart data={dailyCostData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="dateLabel" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickLine={false} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area type="monotone" dataKey="costUsd" name="Cost ($)" stroke="hsl(var(--log-green))" fill="hsl(var(--log-green) / 0.15)" strokeWidth={2} />
                    </AreaChart>
                  </ChartContainer>
                </div>
              )}

              {/* Cost by model list */}
              {costData.costByModel.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-3">Cost by model</p>
                  <div className="space-y-2">
                    {costData.costByModel.map(({ model, cost, calls, tokens }, i) => (
                      <div
                        key={model}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border border-l-4"
                        style={{ borderLeftColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="rounded-full w-2 h-2 shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="font-medium text-foreground">{getAiModelDisplayName(model)}</span>
                          <span className="text-xs text-muted-foreground">{calls} calls, {tokens.toLocaleString()} tokens</span>
                        </div>
                        <span className="text-sm font-medium text-foreground shrink-0 ml-2">
                          {cost > 0 ? `$${(cost / 10000).toFixed(4)}` : "$0.00"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* GitHub Pushes chart */}
        <Card className="card-lift mb-8 border-border shadow-forest">
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
                  <XAxis dataKey="dateLabel" tick={{ fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--log-green))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Slack Messages chart */}
        <Card className="card-lift mb-8 border-border shadow-forest">
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
                  <XAxis dataKey="dateLabel" tick={{ fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Repositories */}
        {topRepos.length > 0 && (
          <Card className="card-lift mb-8 border-border shadow-forest">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <TrendingUp className="w-5 h-5 text-log-green" />
                Top Repositories
              </CardTitle>
              <p className="text-sm text-muted-foreground">Click a repo to see file and folder breakdown</p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
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
                        <span className="text-sm text-red-600 dark:text-red-400">{repo.totalDeletions > 0 ? `\u2212${repo.totalDeletions}` : "0"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* AI Model Usage */}
        <Card className="card-lift border-border shadow-forest">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Cpu className="w-5 h-5 text-log-green" />
              AI Model Usage (all time)
            </CardTitle>
            <p className="text-sm text-muted-foreground">Tracked per summary so you can see which model you use most</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : !data?.aiModelUsage?.length ? (
              <p className="text-muted-foreground py-4">No AI usage recorded yet. Summaries will be tracked when you push.</p>
            ) : (
              <div className="space-y-2">
                {data.aiModelUsage.map(({ model, count }, i) => (
                  <div
                    key={model}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border border-l-4"
                    style={{ borderLeftColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="rounded-full w-2 h-2 shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="font-medium text-foreground">{getAiModelDisplayName(model)}</span>
                    </div>
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
              {repoDetail?.repository?.fullName ?? "Repository"} -- lines changed
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
                          <th className="text-right p-2 text-muted-foreground">&minus; Deletions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repoDetail.folderStats.map(({ folder, additions, deletions }) => (
                          <tr key={folder} className="border-b border-border/50 last:border-0">
                            <td className="p-2 font-mono text-foreground">{folder}</td>
                            <td className="p-2 text-right text-green-600 dark:text-green-400">+{additions}</td>
                            <td className="p-2 text-right text-red-600 dark:text-red-400">&minus;{deletions}</td>
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
                          <th className="text-right p-2 text-muted-foreground">&minus; Deletions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repoDetail.fileStats.slice(0, 50).map(({ filePath, additions, deletions }) => (
                          <tr key={filePath} className="border-b border-border/50 last:border-0">
                            <td className="p-2 font-mono text-foreground truncate max-w-[200px]" title={filePath}>{filePath}</td>
                            <td className="p-2 text-right text-green-600 dark:text-green-400">+{additions}</td>
                            <td className="p-2 text-right text-red-600 dark:text-red-400">&minus;{deletions}</td>
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
      <Footer />
    </div>
  );
}
