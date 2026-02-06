import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Key, Sparkles, CheckCircle2, Loader2, Trash2, Search, DollarSign, Zap, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/footer";
import { getAiModelDisplayName } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/date";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AiUsage } from "@shared/schema";

interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number | null;
  pricing: {
    prompt: number;
    completion: number;
    request?: number;
  } | null;
  top_provider?: { context_length?: number; max_completion_tokens?: number } | null;
}

interface ProfileUser {
  id: number;
  username: string;
  hasOpenRouterKey?: boolean;
}

interface UsageCall {
  id: number;
  model: string;
  tokensUsed: number | null;
  cost: number | null;
  costFormatted: string | null;
  createdAt: string;
  /** OpenRouter generation id (gen-xxx) for usage-per-gen link */
  generationId?: string | null;
}

interface CostByModelRow {
  model: string;
  totalCostCents: number;
  totalCalls: number;
  totalTokens: number;
  lastAt: string | null;
}

interface OpenRouterUsage {
  totalCalls: number;
  totalTokens: number;
  totalCostCents: number;
  totalCostFormatted: string | null;
  /** Per-model totals from server */
  costByModel?: CostByModelRow[];
  calls: UsageCall[];
  /** Last-used ISO timestamp per model (UTC); display with formatLocalDateTime for user's timezone */
  lastUsedByModel?: Record<string, string>;
}

interface OpenRouterCredits {
  totalCredits: number;
  totalUsage: number;
  remainingCredits: number;
}

interface IntegrationOption {
  id: number;
  repositoryName: string;
  slackChannelName: string;
  aiModel?: string;
}

interface UsagePerGenResult {
  generationId: string;
  costUsd: number | null;
  costCents: number | null;
  tokensPrompt: number;
  tokensCompletion: number;
  tokensUsed: number;
}

export default function Models() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [contextFilter, setContextFilter] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<OpenRouterModel | null>(null);
  const [applyToIntegrationId, setApplyToIntegrationId] = useState<string>("");
  const [viewingGenerationId, setViewingGenerationId] = useState<string | null>(null);
  const [usagePerGenResult, setUsagePerGenResult] = useState<UsagePerGenResult | null>(null);
  const [recentCallsOpen, setRecentCallsOpen] = useState(false);
  const [recentCallsModelFilter, setRecentCallsModelFilter] = useState<string>("");
  const [recentCallsSearch, setRecentCallsSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profileResponse, isLoading: profileLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
  });
  const userHasKey = !!profileResponse?.user?.hasOpenRouterKey;

  const { data: modelsData, isLoading: modelsLoading } = useQuery<{ models: OpenRouterModel[] }>({
    queryKey: ["/api/openrouter/models"],
    queryFn: async () => {
      const res = await fetch("/api/openrouter/models", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json();
    },
  });
  const allModels = modelsData?.models ?? [];

  const { data: usageData, isLoading: usageLoading, isError: usageError } = useQuery<OpenRouterUsage>({
    queryKey: ["/api/openrouter/usage"],
    queryFn: async () => {
      const res = await fetch("/api/openrouter/usage", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load usage");
      const data = await res.json();
      return {
        totalCalls: data.totalCalls ?? 0,
        totalTokens: data.totalTokens ?? 0,
        totalCostCents: data.totalCostCents ?? 0,
        totalCostFormatted: data.totalCostFormatted ?? null,
        costByModel: Array.isArray(data.costByModel) ? data.costByModel : undefined,
        calls: Array.isArray(data.calls) ? data.calls : [],
        lastUsedByModel: data.lastUsedByModel && typeof data.lastUsedByModel === "object" ? data.lastUsedByModel : undefined,
      };
    },
    enabled: userHasKey,
    retry: 1,
  });

  const { data: creditsData, isLoading: creditsLoading, isError: creditsError, error: creditsErrorObj } = useQuery<OpenRouterCredits>({
    queryKey: ["/api/openrouter/credits"],
    queryFn: async () => {
      const res = await fetch("/api/openrouter/credits", { credentials: "include" });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Credits require a provisioning key");
      }
      if (!res.ok) throw new Error("Failed to load credits");
      return res.json();
    },
    enabled: userHasKey,
    retry: false,
  });

  // Last-used timestamp per model — merge all sources so the browse table can match by full id or base name
  const lastUsedByModel = (() => {
    if (!userHasKey || !usageData) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    const upsert = (key: string, at: string) => {
      if (!key || !at) return;
      const prev = map[key] ? new Date(map[key]).getTime() : 0;
      if (new Date(at).getTime() > prev) map[key] = at;
    };
    // 1. Server-side lastUsedByModel (keyed by stored model string e.g. "x-ai/grok-4.1-fast")
    if (usageData.lastUsedByModel) {
      for (const [m, at] of Object.entries(usageData.lastUsedByModel)) {
        upsert(m, at);
        const slash = m.indexOf("/");
        if (slash >= 0) upsert(m.slice(slash + 1), at);
      }
    }
    // 2. costByModel (has lastAt per model)
    if (usageData.costByModel) {
      for (const r of usageData.costByModel) {
        if (r.lastAt) {
          upsert(r.model, r.lastAt);
          const slash = r.model.indexOf("/");
          if (slash >= 0) upsert(r.model.slice(slash + 1), r.lastAt);
        }
      }
    }
    // 3. Recent calls fallback
    if (usageData.calls?.length) {
      for (const c of usageData.calls) {
        const m = String(c?.model ?? "").trim();
        const at = c?.createdAt != null ? String(c.createdAt) : "";
        if (m && at) {
          upsert(m, at);
          const slash = m.indexOf("/");
          if (slash >= 0) upsert(m.slice(slash + 1), at);
        }
      }
    }
    return map;
  })();

  // Lookup helper: try full model id first, then base name (after /)
  const getLastUsed = (modelId: string): string | undefined => {
    if (lastUsedByModel[modelId]) return lastUsedByModel[modelId];
    const slash = modelId.indexOf("/");
    if (slash >= 0) return lastUsedByModel[modelId.slice(slash + 1)];
    return undefined;
  };

  const { data: integrations } = useQuery<IntegrationOption[]>({
    queryKey: ["/api/integrations"],
    queryFn: async () => {
      const res = await fetch("/api/integrations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load integrations");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: userHasKey,
  });

  const applyToIntegrationMutation = useMutation({
    mutationFn: async ({ integrationId, modelId }: { integrationId: number; modelId: string }) => {
      const res = await apiRequest("PATCH", `/api/integrations/${integrationId}`, { aiModel: modelId });
      return res.json();
    },
    onSuccess: (_, { modelId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/openrouter/usage"] });
      setSelectedModel(null);
      setApplyToIntegrationId("");
      toast({
        title: "Model applied",
        description: `Integration will use ${getAiModelDisplayName(modelId)} for commit summaries.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to apply model", description: e.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await fetch("/api/openrouter/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.valid) throw new Error(data.error || "Verification failed");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Key verified", description: "You can save it below." });
    },
    onError: (e: Error) => {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    },
  });

  const saveKeyMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("POST", "/api/openrouter/key", { apiKey: key.trim() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/openrouter/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/openrouter/credits"] });
      setApiKeyInput("");
      toast({ title: "API key saved", description: "Your OpenRouter key is stored securely." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to save key", description: e.message, variant: "destructive" });
    },
  });

  const removeKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/openrouter/key");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/openrouter/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/openrouter/credits"] });
      toast({ title: "API key removed", description: "You can add a new key anytime." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to remove key", description: e.message, variant: "destructive" });
    },
  });

  const handleVerifyAndSave = () => {
    const key = apiKeyInput.trim();
    if (!key) {
      toast({ title: "Enter your key", description: "Paste your OpenRouter API key first.", variant: "destructive" });
      return;
    }
    verifyMutation.mutate(key, {
      onSuccess: () => {
        saveKeyMutation.mutate(key);
      },
    });
  };

  // /api/openrouter/usage: get all usage for the current user
  // /api/openrouter/usage-per-gen/:id
  // /api/openrouter/update-usage/:id: update usage for a specific generation
  // /api/openrouter/delete-usage/:id: delete usage for a specific generation

  const fetchAllUsageMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/openrouter/usage", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load usage");
      const data = await res.json();
      return {
        totalCalls: data.totalCalls ?? 0,
        totalTokens: data.totalTokens ?? 0,
        totalCostCents: data.totalCostCents ?? 0,
        totalCostFormatted: data.totalCostFormatted ?? null,
        costByModel: Array.isArray(data.costByModel) ? data.costByModel : undefined,
        calls: Array.isArray(data.calls) ? data.calls : [],
        lastUsedByModel: data.lastUsedByModel && typeof data.lastUsedByModel === "object" ? data.lastUsedByModel : undefined,
      } as OpenRouterUsage;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/openrouter/usage"], data);
      toast({ title: "Usage refreshed", description: "OpenRouter usage data updated." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to fetch usage", description: e.message, variant: "destructive" });
    },
  });

  const fetchUsagePerGenMutation = useMutation({
    mutationFn: async (generationId: string) => {
      const res = await fetch(`/api/openrouter/usage-per-gen/${encodeURIComponent(generationId)}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      return {
        generationId: data.generationId ?? generationId,
        costUsd: data.costUsd ?? null,
        costCents: data.costCents ?? null,
        tokensPrompt: data.tokensPrompt ?? 0,
        tokensCompletion: data.tokensCompletion ?? 0,
        tokensUsed: data.tokensUsed ?? 0,
      } as UsagePerGenResult;
    },
    onSuccess: (data, generationId) => {
      queryClient.setQueryData<UsagePerGenResult>([`/api/openrouter/usage-per-gen/${encodeURIComponent(generationId)}`], data);
      setUsagePerGenResult(data);
    },
    onError: (e: Error, generationId) => {
      toast({ title: "Could not load usage", description: e.message, variant: "destructive" });
      setViewingGenerationId(null);
      setUsagePerGenResult(null);
    },
  });

  const updateUsagePerGenMutation = useMutation({
    mutationFn: async ({ generationId, usage }: { generationId: string; usage: Partial<AiUsage> }) => {
      const res = await apiRequest("PATCH", `/api/openrouter/update-usage/${encodeURIComponent(generationId)}`, usage);
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/openrouter/usage"] });
      toast({ title: "Usage updated", description: "OpenRouter usage record updated." });
    },
    onError: (e: Error) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  const deleteUsagePerGenMutation = useMutation({
    mutationFn: async (generationId: string) => {
      const res = await apiRequest("DELETE", `/api/openrouter/delete-usage/${encodeURIComponent(generationId)}`);
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: (_, generationId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/openrouter/usage"] });
      setViewingGenerationId(null);
      setUsagePerGenResult(null);
      toast({ title: "Usage deleted", description: "Record removed from your usage history." });
    },
    onError: (e: Error) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    },
  });

  const handleFetchAllUsage = () => fetchAllUsageMutation.mutate();

  const handleViewUsagePerGen = (generationId: string) => {
    setViewingGenerationId(generationId);
    setUsagePerGenResult(null);
    fetchUsagePerGenMutation.mutate(generationId);
  };

  const handleRefreshUsagePerGen = () => {
    if (viewingGenerationId) fetchUsagePerGenMutation.mutate(viewingGenerationId);
  };

  const handleUpdateUsagePerGen = (generationId: string, usage: Partial<AiUsage>) => {
    updateUsagePerGenMutation.mutate({ generationId, usage });
  };

  const handleDeleteUsagePerGen = (generationId: string) => {
    deleteUsagePerGenMutation.mutate(generationId);
  };

  const filteredModels = allModels.filter((m) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      m.id.toLowerCase().includes(q) ||
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.description && m.description.toLowerCase().includes(q));
    const ctx = contextFilter ? parseInt(contextFilter, 10) : 0;
    const matchesContext = !ctx || (m.context_length != null && m.context_length >= ctx);
    return matchesSearch && matchesContext;
  });

  const formatPrice = (price: number | undefined | null) => {
    if (price == null || price === 0) return "—";
    return `$${(price * 1000).toFixed(4)}/1K`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-log-green" />
            AI Models
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your OpenRouter API key, explore models, and track usage and cost.
          </p>
        </div>

        {/* API Key section */}
        <Card className="card-lift mb-8 border-border shadow-forest">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Key className="w-5 h-5 text-log-green" />
              OpenRouter API Key
            </CardTitle>
            <CardDescription>
              Add your key from{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-log-green hover:underline"
              >
                openrouter.ai/keys
              </a>{" "}
              to use OpenRouter models for commit summaries. Your key is stored encrypted and never shared.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileLoading ? (
              <Skeleton className="h-10 w-full max-w-md" />
            ) : userHasKey ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">API key saved</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    disabled={removeKeyMutation.isPending}
                    onClick={() => removeKeyMutation.mutate()}
                  >
                    {removeKeyMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-1" />
                        Remove key
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  To <strong className="text-foreground">select which model</strong> an integration uses: go to{" "}
                  <Link href="/integrations" className="text-log-green hover:underline">Integrations</Link>
                  {" "}or{" "}
                  <Link href="/dashboard" className="text-log-green hover:underline">Dashboard</Link>
                  , open the <span className="font-medium text-foreground">⋮ menu</span> on an integration, turn on{" "}
                  <span className="font-medium text-foreground">OpenRouter</span>, pick a model from the dropdown, and save.
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                <Input
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="font-mono bg-background border-border text-foreground"
                />
                <Button
                  variant="glow"
                  className="text-white shrink-0"
                  disabled={!apiKeyInput.trim() || verifyMutation.isPending || saveKeyMutation.isPending}
                  onClick={handleVerifyAndSave}
                >
                  {(verifyMutation.isPending || saveKeyMutation.isPending) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Verify & Save"
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage section (when key is set) */}
        {userHasKey && (
          <Card className="card-lift mb-8 border-border shadow-forest">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <DollarSign className="w-5 h-5 text-log-green" />
                Usage & cost
              </CardTitle>
              <CardDescription>
                Calls and token usage from PushLog using your OpenRouter key. Cost is estimated from our recorded usage and may show $0.00 for some calls — see{" "}
                <a href="https://openrouter.ai/activity" target="_blank" rel="noopener noreferrer" className="text-log-green hover:underline">
                  openrouter.ai/activity
                </a>{" "}for exact costs.
              </CardDescription>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={handleFetchAllUsage}
                disabled={fetchAllUsageMutation.isPending}
              >
                {fetchAllUsageMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Refresh usage
              </Button>
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : usageError ? (
                <p className="text-sm text-muted-foreground">Could not load usage. You can still browse and apply models below.</p>
              ) : usageData ? (
                <>
                  {/* Models in use (integrations using OpenRouter) */}
                  {integrations && integrations.some((i) => i.aiModel?.includes("/")) && (
                    <div className="mb-6">
                      <p className="text-sm font-medium text-foreground mb-2">Models in use</p>
                      <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50 border-border">
                              <TableHead className="text-foreground">Integration</TableHead>
                              <TableHead className="text-foreground">Model</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {integrations
                              .filter((i) => i.aiModel?.includes("/"))
                              .map((i) => (
                                <TableRow key={i.id} className="border-border">
                                  <TableCell className="font-medium text-foreground">
                                    {i.repositoryName} → #{i.slackChannelName}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {getAiModelDisplayName(i.aiModel!)}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Total calls</p>
                      <p className="text-xl font-semibold text-foreground">{usageData.totalCalls ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Total tokens</p>
                      <p className="text-xl font-semibold text-foreground">
                        {(usageData.totalTokens ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Estimated cost</p>
                      <p className="text-xl font-semibold text-foreground">
                        {usageData.totalCostFormatted ?? "—"}
                      </p>
                    </div>
                    {creditsLoading ? (
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">OpenRouter credits</p>
                        <Skeleton className="h-7 w-24 mt-1" />
                      </div>
                    ) : creditsError || !creditsData ? (
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">OpenRouter credits</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {creditsError && creditsErrorObj instanceof Error && creditsErrorObj.message.includes("provisioning")
                            ? "Use a provisioning key at openrouter.ai/keys to see credits."
                            : "—"}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          <a
                            href="https://openrouter.ai/docs/api/api-reference/credits/get-credits"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-log-green"
                          >
                            OpenRouter credits
                          </a>
                        </p>
                        <p className="text-xl font-semibold text-foreground">
                          <span className="text-log-green">{creditsData.remainingCredits.toLocaleString()}</span>
                          <span className="text-sm font-normal text-muted-foreground"> available</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {creditsData.totalUsage.toLocaleString()} cost used
                        </p>
                      </div>
                    )}
                  </div>
                  {Array.isArray(usageData.calls) && usageData.calls.length > 0 ? (
                    <>
                      <h4 className="text-sm font-semibold text-foreground mt-2 mb-2">Cost by model</h4>
                      <div className="rounded-md border border-border overflow-hidden mb-6">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50 border-border">
                              <TableHead className="text-foreground">Model</TableHead>
                              <TableHead className="text-foreground">Calls</TableHead>
                              <TableHead className="text-foreground">Tokens</TableHead>
                              <TableHead className="text-foreground">Cost</TableHead>
                              <TableHead className="text-foreground">Last used</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(() => {
                              // Issue #12: Deduplicate models — group by canonical base name (part after provider/)
                              const deduped = new Map<string, CostByModelRow>();
                              for (const r of usageData.costByModel ?? []) {
                                // Canonical key: use base model name (e.g. "gpt-4o" from "openai/gpt-4o")
                                const slashIdx = r.model.indexOf("/");
                                const canonical = slashIdx >= 0 ? r.model.slice(slashIdx + 1) : r.model;
                                const existing = deduped.get(canonical);
                                if (existing) {
                                  existing.totalCalls += r.totalCalls;
                                  existing.totalTokens += r.totalTokens;
                                  existing.totalCostCents += r.totalCostCents;
                                  // Keep the most recent lastAt
                                  if (r.lastAt && (!existing.lastAt || new Date(r.lastAt).getTime() > new Date(existing.lastAt).getTime())) {
                                    existing.lastAt = r.lastAt;
                                  }
                                  // Keep the longer/more specific model id for display
                                  if (r.model.length > existing.model.length) existing.model = r.model;
                                } else {
                                  deduped.set(canonical, { ...r });
                                }
                              }
                              return Array.from(deduped.values())
                                .sort((a, b) => {
                                  const tA = (a.lastAt && !Number.isNaN(new Date(a.lastAt).getTime())) ? new Date(a.lastAt).getTime() : 0;
                                  const tB = (b.lastAt && !Number.isNaN(new Date(b.lastAt).getTime())) ? new Date(b.lastAt).getTime() : 0;
                                  return tB - tA;
                                });
                            })().map((r) => (
                                <TableRow key={r.model} className="border-border">
                                  <TableCell className="font-medium text-foreground">
                                    {getAiModelDisplayName(r.model)}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">{r.totalCalls}</TableCell>
                                  <TableCell className="text-muted-foreground">{r.totalTokens.toLocaleString()}</TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {r.totalCostCents != null
                                      ? r.totalCostCents === 0
                                        ? "$0.00"
                                        : `$${(r.totalCostCents / 10000).toFixed(4)}`
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-sm">
                                    {r.lastAt ? formatLocalDateTime(r.lastAt) : "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                      <Collapsible open={recentCallsOpen} onOpenChange={setRecentCallsOpen}>
                        <div className="flex flex-wrap items-center gap-2 mt-4 mb-2">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 text-foreground hover:bg-muted/50">
                              {recentCallsOpen ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                              <span className="text-sm font-semibold">Recent calls</span>
                              <span className="text-muted-foreground font-normal text-xs ml-1">({usageData.calls.length})</span>
                            </Button>
                          </CollapsibleTrigger>
                          <Select value={recentCallsModelFilter || "all"} onValueChange={(v) => setRecentCallsModelFilter(v === "all" ? "" : v)}>
                            <SelectTrigger className="w-[200px] h-8 text-sm bg-background border-border text-foreground">
                              <SelectValue placeholder="All models" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All models</SelectItem>
                              {Array.from(new Set(usageData.calls.map((c) => c.model))).sort().map((m) => (
                                <SelectItem key={m} value={m}>{getAiModelDisplayName(m)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="relative flex-1 min-w-[140px] max-w-[220px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Search calls…"
                              value={recentCallsSearch}
                              onChange={(e) => setRecentCallsSearch(e.target.value)}
                              className="h-8 pl-8 text-sm bg-background border-border text-foreground"
                            />
                          </div>
                        </div>
                        <CollapsibleContent>
                          <div className="rounded-md border border-border overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50 border-border">
                                  <TableHead className="text-foreground">Model</TableHead>
                                  <TableHead className="text-foreground">Tokens</TableHead>
                                  <TableHead className="text-foreground">Cost</TableHead>
                                  <TableHead className="text-foreground">Date</TableHead>
                                  <TableHead className="text-foreground w-[80px]">View</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {usageData.calls
                                  .filter((c) => !recentCallsModelFilter || c.model === recentCallsModelFilter)
                                  .filter((c) => {
                                    if (!recentCallsSearch.trim()) return true;
                                    const q = recentCallsSearch.toLowerCase();
                                    return (
                                      c.model.toLowerCase().includes(q) ||
                                      getAiModelDisplayName(c.model).toLowerCase().includes(q) ||
                                      (c.costFormatted ?? '').toLowerCase().includes(q) ||
                                      String(c.tokensUsed ?? '').includes(q)
                                    );
                                  })
                                .map((c) => (
                                  <TableRow key={c.id} className="border-border">
                                    <TableCell className="font-medium text-foreground text-sm">
                                      {getAiModelDisplayName(c.model)}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">{(c.tokensUsed ?? 0).toLocaleString()}</TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                      {c.costFormatted != null && c.costFormatted !== ""
                                        ? c.costFormatted
                                        : typeof c.cost === "number"
                                          ? c.cost === 0
                                            ? "$0.00"
                                            : `$${(c.cost / 10000).toFixed(4)}`
                                          : "—"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                      {(c.createdAt ?? (c as any).created_at) ? formatLocalDateTime((c.createdAt ?? (c as any).created_at) as string) : "—"}
                                    </TableCell>
                                    <TableCell>
                                      {c.generationId ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs text-log-green hover:text-log-green/90"
                                          onClick={() => handleViewUsagePerGen(c.generationId!)}
                                          disabled={fetchUsagePerGenMutation.isPending && viewingGenerationId === c.generationId}
                                        >
                                          {fetchUsagePerGenMutation.isPending && viewingGenerationId === c.generationId ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                          ) : (
                                            <>View</>
                                          )}
                                        </Button>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          {(recentCallsModelFilter || recentCallsSearch.trim()) &&
                            usageData.calls
                              .filter((c) => !recentCallsModelFilter || c.model === recentCallsModelFilter)
                              .filter((c) => {
                                if (!recentCallsSearch.trim()) return true;
                                const q = recentCallsSearch.toLowerCase();
                                return c.model.toLowerCase().includes(q) || getAiModelDisplayName(c.model).toLowerCase().includes(q) || (c.costFormatted ?? '').toLowerCase().includes(q) || String(c.tokensUsed ?? '').includes(q);
                              }).length === 0 && (
                            <p className="text-sm text-muted-foreground py-3">No calls match your filters.</p>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No OpenRouter calls yet. Use an integration with OpenRouter to see usage here.</p>
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Models list */}
        <Card className="card-lift border-border shadow-forest">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Zap className="w-5 h-5 text-log-green" />
              Browse OpenRouter models
            </CardTitle>
            <CardDescription>
              Search and filter by name or context length. Click a model for details and to apply it to an integration.{" "}
              <a
                href="https://openrouter.ai/models"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-log-green hover:underline font-medium"
              >
                View all models on OpenRouter <ExternalLink className="w-3 h-3 inline" />
              </a>
            </CardDescription>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-background border-border text-foreground"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="context-filter" className="text-muted-foreground whitespace-nowrap text-sm">
                  Min context
                </Label>
                <Input
                  id="context-filter"
                  type="number"
                  placeholder="e.g. 128000"
                  min={0}
                  value={contextFilter}
                  onChange={(e) => setContextFilter(e.target.value)}
                  className="w-32 bg-background border-border text-foreground"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {modelsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 border-border">
                      <TableHead className="text-foreground">Model</TableHead>
                      <TableHead className="text-foreground">Context</TableHead>
                      <TableHead className="text-foreground">Prompt</TableHead>
                      <TableHead className="text-foreground">Completion</TableHead>
                      {userHasKey && <TableHead className="text-foreground">Last used</TableHead>}
                      <TableHead className="text-foreground hidden md:table-cell">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredModels
                      .slice()
                      .sort((a, b) => {
                        // Models you've used appear first, sorted by most recently used
                        const aTime = getLastUsed(a.id) ? new Date(getLastUsed(a.id)!).getTime() : 0;
                        const bTime = getLastUsed(b.id) ? new Date(getLastUsed(b.id)!).getTime() : 0;
                        if (aTime !== bTime) return bTime - aTime;
                        return 0; // keep original order for unused models
                      })
                      .slice(0, 100).map((m) => (
                      <TableRow
                        key={m.id}
                        className="border-border cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedModel(m)}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{m.name || m.id}</p>
                            <p className="text-xs text-muted-foreground font-mono">{m.id}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.context_length != null ? m.context_length.toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatPrice(m.pricing?.prompt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatPrice(m.pricing?.completion)}
                        </TableCell>
                        {userHasKey && (
                          <TableCell className="text-muted-foreground text-sm">
                            {getLastUsed(m.id) ? formatLocalDateTime(getLastUsed(m.id)!) : "—"}
                          </TableCell>
                        )}
                        <TableCell className="text-muted-foreground text-sm hidden md:table-cell max-w-xs truncate">
                          {m.description || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredModels.length > 100 && (
                  <p className="text-sm text-muted-foreground p-3 border-t border-border">
                    Showing first 100 of {filteredModels.length} models. Narrow your search to see more.
                  </p>
                )}
                {filteredModels.length === 0 && (
                  <p className="text-sm text-muted-foreground p-6 text-center">No models match your filters.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage per generation modal (View from Recent calls) */}
        <Dialog
          open={!!viewingGenerationId}
          onOpenChange={(open) => {
            if (!open) {
              setViewingGenerationId(null);
              setUsagePerGenResult(null);
            }
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-foreground">Usage for this call</DialogTitle>
              <DialogDescription>
                Fetched from OpenRouter for generation {viewingGenerationId?.slice(0, 20)}…
              </DialogDescription>
            </DialogHeader>
            {fetchUsagePerGenMutation.isPending ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : usagePerGenResult ? (
              <div className="space-y-3 text-sm">
                <p><span className="font-medium text-foreground">Cost:</span>{" "}
                  {usagePerGenResult.costCents != null
                    ? `$${(usagePerGenResult.costCents / 10000).toFixed(4)}`
                    : usagePerGenResult.costUsd != null
                      ? `$${usagePerGenResult.costUsd.toFixed(4)}`
                      : "—"}
                </p>
                <p><span className="font-medium text-foreground">Tokens (prompt):</span>{" "}{usagePerGenResult.tokensPrompt.toLocaleString()}</p>
                <p><span className="font-medium text-foreground">Tokens (completion):</span>{" "}{usagePerGenResult.tokensCompletion.toLocaleString()}</p>
                <p><span className="font-medium text-foreground">Total tokens:</span>{" "}{usagePerGenResult.tokensUsed.toLocaleString()}</p>
                <a
                  href={`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(usagePerGenResult.generationId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-log-green hover:underline text-sm"
                >
                  Open on OpenRouter <ExternalLink className="w-3 h-3" />
                </a>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshUsagePerGen}
                    disabled={fetchUsagePerGenMutation.isPending}
                  >
                    {fetchUsagePerGenMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => viewingGenerationId && handleDeleteUsagePerGen(viewingGenerationId)}
                    disabled={deleteUsagePerGenMutation.isPending}
                  >
                    {deleteUsagePerGenMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Delete from history
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Model detail modal */}
        <Dialog open={!!selectedModel} onOpenChange={(open) => !open && setSelectedModel(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            {selectedModel && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl text-foreground flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-log-green" />
                    {selectedModel.name || selectedModel.id}
                  </DialogTitle>
                  <DialogDescription className="font-mono text-xs text-muted-foreground">
                    {selectedModel.id}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {selectedModel.description && (
                    <p className="text-sm text-muted-foreground">{selectedModel.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Context length</p>
                      <p className="font-medium text-foreground">
                        {selectedModel.context_length != null
                          ? selectedModel.context_length.toLocaleString()
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Prompt (per 1K)</p>
                      <p className="font-medium text-foreground">{formatPrice(selectedModel.pricing?.prompt)}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Completion (per 1K)</p>
                      <p className="font-medium text-foreground">{formatPrice(selectedModel.pricing?.completion)}</p>
                    </div>
                    {selectedModel.pricing?.request != null && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Request</p>
                        <p className="font-medium text-foreground">{formatPrice(selectedModel.pricing.request)}</p>
                      </div>
                    )}
                  </div>
                    {selectedModel.top_provider && (selectedModel.top_provider.context_length != null || selectedModel.top_provider.max_completion_tokens != null) && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Top provider</p>
                      {selectedModel.top_provider.context_length != null && (
                        <p className="text-foreground">Context: {selectedModel.top_provider.context_length.toLocaleString()}</p>
                      )}
                      {selectedModel.top_provider.max_completion_tokens != null && (
                        <p className="text-foreground">Max completion tokens: {selectedModel.top_provider.max_completion_tokens.toLocaleString()}</p>
                      )}
                    </div>
                  )}
                  {userHasKey && getLastUsed(selectedModel.id) && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Last used (your timezone)</p>
                      <p className="font-medium text-foreground">{formatLocalDateTime(getLastUsed(selectedModel.id)!)}</p>
                    </div>
                  )}
                  <a
                    href={`https://openrouter.ai/models/${selectedModel.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-log-green hover:underline"
                  >
                    View on OpenRouter <ExternalLink className="w-4 h-4" />
                  </a>
                  <Separator className="my-4" />
                  {userHasKey && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">Use this model for an integration</p>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[200px]">
                          <Select value={applyToIntegrationId} onValueChange={setApplyToIntegrationId}>
                            <SelectTrigger className="bg-background border-border text-foreground">
                              <SelectValue placeholder="Choose integration..." />
                            </SelectTrigger>
                            <SelectContent>
                              {(integrations ?? []).map((int) => (
                                <SelectItem key={int.id} value={String(int.id)} className="text-foreground">
                                  {int.repositoryName} → #{int.slackChannelName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          variant="glow"
                          className="text-white shrink-0"
                          disabled={!applyToIntegrationId || applyToIntegrationMutation.isPending}
                          onClick={() => {
                            if (!applyToIntegrationId || !selectedModel) return;
                            applyToIntegrationMutation.mutate({
                              integrationId: Number(applyToIntegrationId),
                              modelId: selectedModel.id,
                            });
                          }}
                        >
                          {applyToIntegrationMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Apply"
                          )}
                        </Button>
                      </div>
                      {integrations?.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No integrations yet. Create one from <Link href="/dashboard" className="text-log-green hover:underline">Dashboard</Link> or{" "}
                          <Link href="/integrations" className="text-log-green hover:underline">Integrations</Link>.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
      <Footer />
    </div>
  );
}
