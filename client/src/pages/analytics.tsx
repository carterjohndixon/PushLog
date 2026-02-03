import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { GitBranch, Bell, Cpu } from "lucide-react";

interface AnalyticsData {
  pushesByDay: { date: string; count: number }[];
  slackMessagesByDay: { date: string; count: number }[];
  aiModelUsage: { model: string; count: number }[];
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
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Analytics() {
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
    queryFn: async () => {
      const response = await fetch("/api/analytics", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  if (error) {
    return (
      <div className="min-h-screen bg-forest-gradient">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <p className="text-destructive">Failed to load analytics. Please try again.</p>
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

  return (
    <div className="min-h-screen bg-forest-gradient">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-2">
            GitHub pushes, Slack messages, and AI model usage over the last 30 days
          </p>
        </div>

        {/* GitHub Pushes */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <GitBranch className="w-5 h-5 text-log-green" />
              GitHub Pushes
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
              Slack Messages Sent
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
              Most Used AI Models
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : !data?.aiModelUsage?.length ? (
              <p className="text-muted-foreground py-4">No AI usage recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {data.aiModelUsage.map(({ model, count }, i) => (
                  <div
                    key={model}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                  >
                    <span className="font-medium text-foreground">{model}</span>
                    <span className="text-muted-foreground">{count} summaries</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
