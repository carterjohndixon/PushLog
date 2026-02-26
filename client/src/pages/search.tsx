import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLocalDateTime } from "@/lib/date";
import { handleTokenExpiration } from "@/lib/utils";
import { Search as SearchIcon, GitBranch, User, Calendar, Filter, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, MessageCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEARCH_DEBOUNCE_MS = 280;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const MAX_PAGE_SIZE = 100;

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

interface PushEventDetail {
  id: number;
  repositoryId: number;
  branch: string;
  commitHash: string;
  commitMessage: string;
  author: string;
  timestamp: string;
  aiSummary: string | null;
  aiImpact: string | null;
  aiCategory: string | null;
  aiDetails: string | null;
  impactScore: number | null;
  riskFlags: string[] | null;
  riskMetadata: { change_type_tags?: string[]; hotspot_files?: string[]; explanations?: string[] } | null;
  notificationSent: boolean;
  additions: number | null;
  deletions: number | null;
  repositoryFullName: string;
  slackChannelName: string | null;
}

export default function Search() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [repositoryId, setRepositoryId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minImpact, setMinImpact] = useState("");
  const hasActiveFilters = !!(repositoryId || from || to || minImpact !== "");
  const [showFilters, setShowFilters] = useState(false);
  const [recentPage, setRecentPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const scrollPositionRef = useRef<number | null>(null);

  // Search-as-you-type: debounce submitted query when input changes
  useEffect(() => {
    const t = setTimeout(() => {
      setSubmittedQ(q.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // When switching back to recent view from search, or when filters change, reset to first page
  const prevSubmittedQ = useRef(submittedQ);
  useEffect(() => {
    if (prevSubmittedQ.current.trim().length > 0 && submittedQ.trim().length === 0) {
      setRecentPage(0);
    }
    prevSubmittedQ.current = submittedQ;
  }, [submittedQ]);

  useEffect(() => {
    setRecentPage(0);
  }, [repositoryId, from, to, minImpact, pageSize]);

  // Repos for filter dropdown and name lookup
  const { data: reposData } = useQuery<{ repositories: RepoOption[] }>({
    queryKey: ["/api/repositories-and-integrations"],
    queryFn: async () => {
      const res = await fetch("/api/repositories-and-integrations", {
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch repositories");
      return res.json();
    },
  });
  const repositories = reposData?.repositories ?? [];
  const repoById = Object.fromEntries(repositories.map((r) => [r.id, r]));

  // Build filter params for recent pushes
  const recentParams = new URLSearchParams();
  recentParams.set("limit", String(Math.min(pageSize, MAX_PAGE_SIZE)));
  recentParams.set("offset", String(recentPage * pageSize));
  if (repositoryId) recentParams.set("repositoryId", repositoryId);
  if (from) recentParams.set("from", from);
  if (to) recentParams.set("to", to);
  if (minImpact !== "") recentParams.set("minImpact", minImpact);

  // Recent pushes (when no search query) – filters apply immediately
  const { data: recentResponse, isLoading: recentLoading, error: recentError } = useQuery<{ events: SearchResult[]; total: number }>({
    queryKey: ["/api/push-events", "search-page", recentPage, pageSize, repositoryId, from, to, minImpact],
    queryFn: async () => {
      const res = await fetch(
        `/api/push-events?${recentParams.toString()}`,
        {
          credentials: "include",
          headers: { Accept: "application/json" },
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.error || "Failed to fetch push events");
        if (handleTokenExpiration(err, queryClient)) return { events: [], total: 0 };
        throw err;
      }
      const raw = await res.json();
      const events = (raw.events ?? raw).map((e: any) => ({
        id: e.id,
        repositoryId: e.repositoryId,
        branch: e.branch,
        commitHash: e.commitHash,
        commitMessage: e.commitMessage,
        author: e.author,
        timestamp: e.timestamp,
        eventType: e.eventType ?? "push",
        aiSummary: e.aiSummary ?? null,
        impactScore: e.impactScore ?? null,
        riskFlags: e.riskFlags ?? null,
      }));
      return { events, total: raw.total ?? events.length };
    },
    enabled: submittedQ.trim().length === 0,
  });

  const recentData = recentResponse?.events ?? [];
  const recentTotal = recentResponse?.total ?? 0;

  // Search results (when user has typed a query)
  const searchParams = new URLSearchParams();
  if (submittedQ.trim()) searchParams.set("q", submittedQ.trim());
  if (repositoryId) searchParams.set("repositoryId", repositoryId);
  if (from) searchParams.set("from", from);
  if (to) searchParams.set("to", to);
  if (minImpact !== "") searchParams.set("minImpact", minImpact);
  searchParams.set("limit", "50");

  const { data: results, isLoading: searchLoading, isFetching: searchFetching, error: searchError } = useQuery<SearchResult[]>({
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

  const isSearchMode = submittedQ.trim().length > 0;
  const isLoading = isSearchMode ? searchLoading : recentLoading;
  const error = isSearchMode ? searchError : recentError;
  const list = isSearchMode ? (results ?? []) : (recentData ?? []);

  // Preserve scroll position when changing pages (next/previous)
  useLayoutEffect(() => {
    if (scrollPositionRef.current != null && !isSearchMode && recentData.length > 0) {
      const saved = scrollPositionRef.current;
      scrollPositionRef.current = null;
      window.scrollTo(0, saved);
    }
  }, [isSearchMode, recentPage, recentData]);

  const handleSearch = () => setSubmittedQ(q.trim());

  const handlePageChange = (direction: "prev" | "next") => {
    scrollPositionRef.current = window.scrollY;
    setRecentPage((p) => (direction === "prev" ? Math.max(0, p - 1) : p + 1));
  };

  // Fetch full push event details when a card is clicked (for modal)
  const { data: pushEventDetail, isLoading: detailLoading } = useQuery<PushEventDetail>({
    queryKey: ["/api/push-events", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/push-events/${selectedEventId}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Failed to load push event");
      return res.json();
    },
    enabled: selectedEventId != null,
  });

  const githubCommitUrl =
    pushEventDetail?.repositoryFullName && pushEventDetail?.commitHash
      ? `https://github.com/${pushEventDetail.repositoryFullName}/commit/${pushEventDetail.commitHash}`
      : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Search push events</h1>
          <p className="text-muted-foreground mt-1">
            Recent pushes below; type to search by summary, commit message, author, or category.
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Type to search (e.g. login, auth, fix)..."
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
                Filters{hasActiveFilters && <Badge variant="secondary" className="text-xs ml-1">active</Badge>}
                <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
              </button>
              {showFilters && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label htmlFor="filter-repository" className="text-xs text-muted-foreground block mb-1">Repository</label>
                    <Select value={repositoryId || "all"} onValueChange={(v) => setRepositoryId(v === "all" ? "" : v)}>
                      <SelectTrigger
                        id="filter-repository"
                        className="h-9 w-full border-border bg-background focus:ring-2 focus:ring-log-green/50 focus:border-log-green/60 transition-colors"
                      >
                        <SelectValue placeholder="All repositories" />
                      </SelectTrigger>
                      <SelectContent
                        className="max-h-[280px] border-border border-l-2 border-l-log-green/60 bg-popover shadow-lg"
                        position="popper"
                      >
                        <SelectItem
                          value="all"
                          className="focus:bg-log-green/15 focus:text-log-green data-[highlighted]:bg-log-green/15 data-[highlighted]:text-log-green"
                        >
                          All repositories
                        </SelectItem>
                        {repositories.map((r) => (
                          <SelectItem
                            key={r.id}
                            value={String(r.id)}
                            className="focus:bg-log-green/15 focus:text-log-green data-[highlighted]:bg-log-green/15 data-[highlighted]:text-log-green"
                          >
                            {r.fullName || (typeof r.owner === "object" ? r.owner?.login : r.owner) + "/" + r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="filter-from" className="text-xs text-muted-foreground block mb-1">From (date)</label>
                    <Input
                      id="filter-from"
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label htmlFor="filter-to" className="text-xs text-muted-foreground block mb-1">To (date)</label>
                    <Input
                      id="filter-to"
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label htmlFor="filter-min-impact" className="text-xs text-muted-foreground block mb-1">Min impact score</label>
                    <Input
                      id="filter-min-impact"
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

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        )}

        {error && !isLoading && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">{(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-sm text-muted-foreground">
                {isSearchMode ? (
                  <>"{submittedQ}" — {list.length} result{list.length !== 1 ? "s" : ""}{searchFetching ? " (updating…)" : ""}</>
                ) : (
                  <>Recent pushes — page {recentPage + 1} of {Math.max(1, Math.ceil(recentTotal / pageSize))} ({list.length} of {recentTotal} event{recentTotal !== 1 ? "s" : ""})</>
                )}
              </p>
              {!isSearchMode && (
                <div className="flex items-center gap-2">
                  <label htmlFor="page-size" className="text-xs text-muted-foreground">Per page</label>
                  <select
                    id="page-size"
                    value={pageSize}
                    onChange={(e) => setPageSize(Math.min(MAX_PAGE_SIZE, Number(e.target.value)))}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {list.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <SearchIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>
                    {isSearchMode
                      ? "No push events match your search. Try different words or filters."
                      : "No push events yet. Connect a repository and push to see activity here."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {list.map((event) => (
                  <Card
                    key={event.id}
                    className="overflow-hidden cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    onClick={() => setSelectedEventId(event.id)}
                  >
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

            {!isSearchMode && list.length > 0 && (
              <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange("prev")}
                  disabled={recentPage === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {recentPage + 1} of {Math.max(1, Math.ceil(recentTotal / pageSize))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange("next")}
                  disabled={(recentPage + 1) * pageSize >= recentTotal}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        <Dialog open={selectedEventId != null} onOpenChange={(open) => !open && setSelectedEventId(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
            {detailLoading ? (
              <div className="py-16 flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-log-green border-t-transparent rounded-full animate-spin" />
              </div>
            ) : pushEventDetail ? (
              <>
                <div className="px-6 pt-6 pb-4 border-b border-border">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-semibold pr-8">
                      Push event details
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-base font-medium text-foreground">{pushEventDetail.repositoryFullName}</span>
                    <Badge variant="outline" className="font-normal">
                      <GitBranch className="h-3 w-3 mr-1.5" />
                      {pushEventDetail.branch}
                    </Badge>
                    {pushEventDetail.impactScore != null && (
                      <Badge variant="secondary" className="font-normal bg-muted/80">
                        Impact: {pushEventDetail.impactScore}
                      </Badge>
                    )}
                    {(pushEventDetail.aiImpact || pushEventDetail.aiCategory) && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {[pushEventDetail.aiImpact, pushEventDetail.aiCategory].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-6 py-5 space-y-5 overflow-y-auto">
                  {pushEventDetail.commitMessage && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                        Commit message
                      </p>
                      <blockquote className="border-l-2 border-log-green/60 bg-muted/30 rounded-r-md px-4 py-3 text-foreground italic">
                        "{pushEventDetail.commitMessage}"
                      </blockquote>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <p className="text-xs text-muted-foreground mb-0.5">Author</p>
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <User className="h-3.5 w-3 text-muted-foreground" />
                        {pushEventDetail.author}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <p className="text-xs text-muted-foreground mb-0.5">Date</p>
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3 text-muted-foreground" />
                        {formatLocalDateTime(pushEventDetail.timestamp)}
                      </p>
                    </div>
                    {(pushEventDetail.additions != null || pushEventDetail.deletions != null) && (
                      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                        <p className="text-xs text-muted-foreground mb-0.5">Changes</p>
                        <p className="text-sm font-medium">
                          <span className="text-emerald-600 dark:text-emerald-400">+{pushEventDetail.additions ?? 0}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-red-600 dark:text-red-400">-{pushEventDetail.deletions ?? 0}</span>
                          <span className="text-muted-foreground text-xs ml-1">lines</span>
                        </p>
                      </div>
                    )}
                    {pushEventDetail.commitHash && (
                      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 col-span-2 sm:col-span-1">
                        <p className="text-xs text-muted-foreground mb-0.5">Commit</p>
                        <p className="text-xs font-mono text-foreground truncate" title={pushEventDetail.commitHash}>
                          {pushEventDetail.commitHash.slice(0, 12)}…
                        </p>
                      </div>
                    )}
                  </div>

                  {pushEventDetail.aiSummary && (
                    <div className="rounded-lg border border-border bg-card p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        AI summary
                      </h4>
                      <p className="text-sm text-foreground leading-relaxed">{pushEventDetail.aiSummary}</p>
                    </div>
                  )}

                  {pushEventDetail.aiDetails && (
                    <div className="rounded-lg border border-border bg-card p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Details
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {pushEventDetail.aiDetails}
                      </p>
                    </div>
                  )}

                  {(pushEventDetail.riskFlags?.length ?? 0) > 0 && (
                    <div className="rounded-lg border border-border bg-card p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Risk flags
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {pushEventDetail.riskFlags!.map((f) => (
                          <Badge key={f} variant="outline" className="font-medium">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {pushEventDetail.riskMetadata?.explanations && pushEventDetail.riskMetadata.explanations.length > 0 && (
                    <div className="rounded-lg border border-border bg-card p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Risk notes
                      </h4>
                      <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
                        {pushEventDetail.riskMetadata.explanations.map((e, i) => (
                          <li key={`${e}-${i}`} className="flex gap-2">
                            <span className="text-log-green">•</span>
                            <span>{e}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-border bg-muted/10 flex flex-wrap gap-3">
                  {githubCommitUrl && (
                    <a
                      href={githubCommitUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md bg-log-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View on GitHub
                    </a>
                  )}
                  {pushEventDetail.notificationSent && pushEventDetail.slackChannelName && (
                    <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm text-muted-foreground">
                      <MessageCircle className="h-4 w-4" />
                      Sent to #{pushEventDetail.slackChannelName}
                    </span>
                  )}
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
