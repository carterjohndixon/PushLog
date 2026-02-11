import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLocalDateTime } from "@/lib/date";
import { handleTokenExpiration } from "@/lib/utils";
import { Search as SearchIcon, GitBranch, User, Calendar, Filter, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface SearchResult {
  id: number;
  repositoryId: number;
  branch: string;
  commitHash: string;
  commitMessage: string;
  author: string;
  timestamp: string;
  eventType: string;
  aiSummary: string | null;
  impactScore: number | null;
  riskFlags: string[] | null;
}

interface RepoOption {
  id: number;
  name: string;
  fullName?: string;
  owner: string | { login: string };
}

export default function Search() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [repositoryId, setRepositoryId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minImpact, setMinImpact] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Repos for filter dropdown and name lookup
  const { data: reposData } = useQuery<{ repositories: RepoOption[] }>({
    queryKey: ["/api/repositories-and-integrations"],
    queryFn: async () => {
      const res = await fetch("/api/repositories-and-integrations", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Failed to fetch repositories");
      return res.json();
    },
  });
  const repositories = reposData?.repositories ?? [];
  const repoById = Object.fromEntries(repositories.map((r) => [r.id, r]));

  // Search results
  const searchParams = new URLSearchParams();
  if (submittedQ.trim()) searchParams.set("q", submittedQ.trim());
  if (repositoryId) searchParams.set("repositoryId", repositoryId);
  if (from) searchParams.set("from", from);
  if (to) searchParams.set("to", to);
  if (minImpact !== "") searchParams.set("minImpact", minImpact);
  searchParams.set("limit", "50");

  const { data: results, isLoading, isFetching, error } = useQuery<SearchResult[]>({
    queryKey: ["/api/search", submittedQ, repositoryId, from, to, minImpact],
    queryFn: async () => {
      const res = await fetch(`/api/search?${searchParams.toString()}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.error || "Search failed");
        if (handleTokenExpiration(err, queryClient)) return [];
        throw err;
      }
      return res.json();
    },
    enabled: submittedQ.trim().length > 0,
  });

  const handleSearch = () => {
    setSubmittedQ(q.trim());
  };
  // If user submitted empty, don't treat as "searched" so we show the prompt
  const hasSearched = submittedQ.trim().length > 0;

  const list = results ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Search push events</h1>
          <p className="text-muted-foreground mt-1">
            Find pushes by summary, commit message, author, or category.
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. login, auth, fix bug..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Button variant="glow" onClick={handleSearch} className="text-white shrink-0">
                <SearchIcon className="h-4 w-4 mr-2" />
                Search
              </Button>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <Filter className="h-4 w-4" />
                Filters
                <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
              </button>
              {showFilters && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Repository</label>
                    <select
                      value={repositoryId}
                      onChange={(e) => setRepositoryId(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">All repositories</option>
                      {repositories.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.fullName || (typeof r.owner === "object" ? r.owner?.login : r.owner) + "/" + r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">From (date)</label>
                    <Input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">To (date)</label>
                    <Input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Min impact score</label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="0–100"
                      value={minImpact}
                      onChange={(e) => setMinImpact(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {!hasSearched && (
          <div className="text-center py-12 text-muted-foreground">
            <SearchIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Enter a search term and click Search to find push events.</p>
          </div>
        )}

        {hasSearched && isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        )}

        {hasSearched && error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">{(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {hasSearched && !isLoading && !error && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {list.length} result{list.length !== 1 ? "s" : ""}
                {isFetching && " (updating…)"}
              </p>
            </div>

            {list.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <SearchIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No push events match your search. Try different words or filters.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {list.map((event) => (
                  <Card key={event.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">
                            {(() => {
                              const repo = repoById[event.repositoryId];
                              if (!repo) return `Repo #${event.repositoryId}`;
                              return repo.fullName || (typeof repo.owner === "object" ? repo.owner?.login : repo.owner) + "/" + repo.name;
                            })()}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            <GitBranch className="h-3 w-3 mr-1" />
                            {event.branch}
                          </Badge>
                          {event.impactScore != null && (
                            <Badge variant="secondary" className="text-xs">
                              Impact {event.impactScore}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatLocalDateTime(event.timestamp)}
                        </span>
                      </div>
                      {event.commitMessage && (
                        <p className="text-sm text-foreground mb-2">"{event.commitMessage}"</p>
                      )}
                      {event.aiSummary && (
                        <p className="text-sm text-muted-foreground mb-2">{event.aiSummary}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {event.author}
                        </span>
                        {event.commitHash && (
                          <span className="font-mono">{event.commitHash.substring(0, 8)}</span>
                        )}
                        {event.riskFlags && event.riskFlags.length > 0 && (
                          <span className="flex items-center gap-1">
                            {event.riskFlags.slice(0, 3).map((f) => (
                              <Badge key={f} variant="outline" className="text-xs">
                                {f}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
