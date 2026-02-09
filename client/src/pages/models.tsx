import { useState, useEffect } from "react";
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
import { Key, Sparkles, CheckCircle2, Loader2, Trash2, Search, DollarSign, Zap, ExternalLink, ChevronDown, ChevronUp, RefreshCw, Star } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/footer";
import { getAiModelDisplayName } from "@/lib/utils";
import { formatLocalDateTime, formatRelativeOrLocal, formatCreatedAt } from "@/lib/date";
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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { formatLocalShortDate } from "@/lib/date";
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
  preferredAiModel?: string;
  monthlyBudget?: number | null;
  overBudgetBehavior?: "free_model" | "skip_ai";
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
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [defaultModelId, setDefaultModelId] = useState<string>("");
  const [replaceAllConfirmOpen, setReplaceAllConfirmOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profileResponse, isLoading: profileLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
  });
  const userHasKey = !!profileResponse?.user?.hasOpenRouterKey;
  const profileUser = profileResponse?.user as ProfileUser | undefined;
  const savedPreferredModel = profileUser?.preferredAiModel ?? "";

  useEffect(() => {
    if (savedPreferredModel) setDefaultModelId((prev) => prev || savedPreferredModel);
  }, [savedPreferredModel]);

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

  const { data: dailyUsageData } = useQuery<{ date: string; totalCost: number; callCount: number }[]>({
    queryKey: ["/api/openrouter/usage/daily"],
    queryFn: async () => {
      const res = await fetch("/api/openrouter/usage/daily", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load daily usage");
      return res.json();
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

  // Favorite models
  const { data: favoriteModels } = useQuery<{ id: number; modelId: string }[]>({
    queryKey: ["/api/openrouter/favorites"],
    queryFn: async () => {
      const res = await fetch("/api/openrouter/favorites", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: userHasKey,
  });
  const favoriteIds = new Set((favoriteModels ?? []).map(f => f.modelId));

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (modelId: string) => {
      if (favoriteIds.has(modelId)) {
        await apiRequest("DELETE", `/api/openrouter/favorites/${encodeURIComponent(modelId)}`);
      } else {
        await apiRequest("POST", "/api/openrouter/favorites", { modelId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/openrouter/favorites"] });
    },
    onError: (e: Error) => {
      toast({ title: "Favorite failed", description: e.message, variant: "destructive" });
    },
  });

  // Budget
  const [budgetInput, setBudgetInput] = useState("");
  const { data: monthlySpendData } = useQuery<{ totalSpend: number; totalSpendUsd: number; callCount: number }>({
    queryKey: ["/api/openrouter/monthly-spend"],
    queryFn: async () => {
      const res = await fetch("/api/openrouter/monthly-spend", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: userHasKey,
    retry: 1,
  });
  const userBudget = profileUser?.monthlyBudget;
  const budgetUsd = userBudget != null && userBudget > 0 ? userBudget / 10000 : null;

  const setBudgetMutation = useMutation({
    mutationFn: async (budget: number | null) => {
      const res = await apiRequest("PATCH", "/api/openrouter/budget", { budget });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/openrouter/monthly-spend"] });
      setBudgetInput("");
      toast({ title: "Budget updated" });
    },
    onError: (e: Error) => {
      toast({ title: "Budget update failed", description: e.message, variant: "destructive" });
    },
  });

  const overBudgetBehaviorMutation = useMutation({
    mutationFn: async (behavior: "free_model" | "skip_ai") => {
      const res = await apiRequest("PATCH", "/api/user", { overBudgetBehavior: behavior });
      return res.json();
    },
    onSuccess: (_, behavior) => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      toast({
        title: "Setting saved",
        description: behavior === "skip_ai" ? "When over budget, AI summaries will be paused (plain push only)." : "When over budget, summaries will use the free model.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    },
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

  const setDefaultModelMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const res = await apiRequest("PATCH", "/api/user", { preferredAiModel: modelId });
      return res.json();
    },
    onSuccess: (_, modelId) => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      toast({
        title: "Default model updated",
        description: `New integrations will use ${getAiModelDisplayName(modelId)}.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to set default model", description: e.message, variant: "destructive" });
    },
  });

  const replaceAllIntegrationsMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const res = await apiRequest("POST", "/api/integrations/replace-all-model", { modelId });
      return res.json();
    },
    onSuccess: (data: { updatedCount: number; preferredAiModel: string }) => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setReplaceAllConfirmOpen(false);
      toast({
        title: "Integrations updated",
        description: `${data.updatedCount} integration(s) now use ${getAiModelDisplayName(data.preferredAiModel)}. This is also your default for new integrations.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update integrations", description: e.message, variant: "destructive" });
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

        {/* Default AI model (when key is set) */}
        {userHasKey && (
          <Card className="card-lift mb-8 border-border shadow-forest">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Sparkles className="w-5 h-5 text-log-green" />
                Default AI model
              </CardTitle>
              <CardDescription>
                This model is used for new integrations. Optionally replace all active integrations with this model.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <Select
                  value={defaultModelId || savedPreferredModel || ""}
                  onValueChange={(v) => setDefaultModelId(v)}
                >
                  <SelectTrigger className="w-full sm:max-w-md bg-background border-border text-foreground">
                    <SelectValue placeholder="Select default model" />
                  </SelectTrigger>
                  <SelectContent>
                    {allModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {getAiModelDisplayName(m.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    className="bg-log-green hover:bg-log-green/90"
                    disabled={!(defaultModelId || savedPreferredModel) || setDefaultModelMutation.isPending}
                    onClick={() => setDefaultModelMutation.mutate(defaultModelId || savedPreferredModel)}
                  >
                    {setDefaultModelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set as default"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-border"
                    disabled={!(defaultModelId || savedPreferredModel) || replaceAllIntegrationsMutation.isPending || !integrations?.length}
                    onClick={() => setReplaceAllConfirmOpen(true)}
                  >
                    {replaceAllIntegrationsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Replace all active integrations"}
                  </Button>
                </div>
              </div>
              {savedPreferredModel && (
                <p className="text-sm text-muted-foreground">
                  Current default: <span className="font-medium text-foreground">{getAiModelDisplayName(savedPreferredModel)}</span>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Usage section (when key is set) */}
        {userHasKey && (
          <Card className="card-lift mb-8 border-border shadow-forest">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <DollarSign className="w-5 h-5 text-log-green" />
                  Usage & cost
                </CardTitle>
                <button
                  onClick={handleFetchAllUsage}
                  disabled={fetchAllUsageMutation.isPending}
                  className="text-muted-foreground hover:text-log-green transition-colors duration-200 disabled:opacity-40 p-1.5 rounded-md hover:bg-muted/50"
                  title="Refresh usage"
                >
                  <RefreshCw className={`w-4 h-4 ${fetchAllUsageMutation.isPending ? "animate-spin" : ""}`} />
                </button>
              </div>
              <CardDescription>
                Calls and token usage from PushLog using your OpenRouter key. Cost is estimated from our recorded usage and may show $0.00 for some calls — see{" "}
                <a href="https://openrouter.ai/activity" target="_blank" rel="noopener noreferrer" className="text-log-green hover:underline">
                  openrouter.ai/activity
                </a>{" "}for exact costs.
              </CardDescription>
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

                  {/* Smart stats: avg cost, cheapest/most expensive model */}
                  {usageData.costByModel && usageData.costByModel.length > 0 && usageData.totalCalls > 0 && (
                    <div className="flex flex-wrap gap-3 mb-6">
                      <div className="flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-sm">
                        <span className="text-muted-foreground">Avg/call:</span>
                        <span className="font-medium text-foreground">
                          ${(usageData.totalCostCents / usageData.totalCalls / 10000).toFixed(4)}
                        </span>
                      </div>
                      {(() => {
                        const withCost = usageData.costByModel.filter(r => r.totalCalls > 0);
                        const cheapest = withCost.length > 0
                          ? withCost.reduce((a, b) => (a.totalCostCents / a.totalCalls) < (b.totalCostCents / b.totalCalls) ? a : b)
                          : null;
                        const priciest = withCost.length > 0
                          ? withCost.reduce((a, b) => (a.totalCostCents / a.totalCalls) > (b.totalCostCents / b.totalCalls) ? a : b)
                          : null;
                        return (
                          <>
                            {cheapest && (
                              <div className="flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-sm">
                                <span className="text-muted-foreground">Cheapest:</span>
                                <span className="font-medium text-foreground">{getAiModelDisplayName(cheapest.model)}</span>
                                <span className="text-xs text-muted-foreground">${(cheapest.totalCostCents / cheapest.totalCalls / 10000).toFixed(4)}/call</span>
                              </div>
                            )}
                            {priciest && priciest.model !== cheapest?.model && (
                              <div className="flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-sm">
                                <span className="text-muted-foreground">Priciest:</span>
                                <span className="font-medium text-foreground">{getAiModelDisplayName(priciest.model)}</span>
                                <span className="text-xs text-muted-foreground">${(priciest.totalCostCents / priciest.totalCalls / 10000).toFixed(4)}/call</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Cost over time chart */}
                  {dailyUsageData && dailyUsageData.some(d => d.totalCost > 0) && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-foreground mb-3">Cost over time (last 30 days)</h4>
                      <ChartContainer config={{ count: { label: "Cost", color: "hsl(var(--log-green))" } }} className="h-[180px] w-full">
                        <AreaChart
                          data={dailyUsageData.map(d => ({
                            dateLabel: formatLocalShortDate(d.date),
                            costUsd: d.totalCost / 10000,
                            calls: d.callCount,
                          }))}
                          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                          <XAxis dataKey="dateLabel" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} />
                          <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickLine={false} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Area type="monotone" dataKey="costUsd" name="Cost ($)" stroke="hsl(var(--log-green))" fill="hsl(var(--log-green) / 0.15)" strokeWidth={2} />
                        </AreaChart>
                      </ChartContainer>
                    </div>
                  )}

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
                                    {r.lastAt ? formatRelativeOrLocal(r.lastAt) : "—"}
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
                                      {(c.createdAt ?? (c as any).created_at) ? formatRelativeOrLocal((c.createdAt ?? (c as any).created_at) as string) : "—"}
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
              {/* Budget: always show when user has key (set budget / monthly spend) */}
              <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Monthly spend</p>
                  {monthlySpendData ? (
                    budgetUsd != null ? (
                      <span className="text-xs text-muted-foreground">
                        ${monthlySpendData.totalSpendUsd.toFixed(4)} / ${budgetUsd.toFixed(2)} budget
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">${monthlySpendData.totalSpendUsd.toFixed(4)} this month</span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                {/* Current spend and budget amounts */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-sm">
                  <span className="text-muted-foreground">
                    Spent this month:{" "}
                    <span className="font-medium text-foreground">
                      {monthlySpendData != null ? `$${monthlySpendData.totalSpendUsd.toFixed(4)}` : "—"}
                    </span>
                  </span>
                  {budgetUsd != null && (
                    <span className="text-muted-foreground">
                      Budget: <span className="font-medium text-foreground">${budgetUsd.toFixed(2)}</span>
                    </span>
                  )}
                </div>
                {budgetUsd != null && monthlySpendData && (
                  <div className="w-full h-2 rounded-full bg-border overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all ${monthlySpendData.totalSpendUsd >= budgetUsd ? "bg-red-500" : "bg-log-green"}`}
                      style={{ width: `${Math.min(100, (monthlySpendData.totalSpendUsd / budgetUsd) * 100)}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={budgetUsd != null ? `$${budgetUsd.toFixed(2)}` : "Set budget ($)"}
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    className="h-8 min-w-[10rem] w-40 text-sm bg-background border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 min-w-[4.5rem] border-border bg-background text-xs font-medium hover:bg-muted hover:border-log-green/50"
                    disabled={setBudgetMutation.isPending}
                    onClick={() => {
                      const val = budgetInput.trim() ? parseFloat(budgetInput) : null;
                      setBudgetMutation.mutate(val);
                    }}
                  >
                    {setBudgetMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : budgetInput.trim() ? "Set" : "Clear"}
                  </Button>
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">When over budget</Label>
                  <Select
                    value={profileUser?.overBudgetBehavior ?? "skip_ai"}
                    onValueChange={(v: "free_model" | "skip_ai") => overBudgetBehaviorMutation.mutate(v)}
                    disabled={overBudgetBehaviorMutation.isPending}
                  >
                    <SelectTrigger className="mt-1.5 h-8 w-full max-w-xs text-sm bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free_model">Use free model (summary still sent)</SelectItem>
                      <SelectItem value="skip_ai">Skip AI (plain push only)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {profileUser?.overBudgetBehavior !== "free_model"
                      ? "Slack will get commit info only until next month or you raise the budget."
                      : "Summaries continue with a free model so you stay within budget."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pinned / favorite models */}
        {userHasKey && favoriteModels && favoriteModels.length > 0 && (
          <Card className="card-lift mb-8 border-border shadow-forest">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                Pinned Models
              </CardTitle>
              <CardDescription>Your favorited models for quick access.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {favoriteModels.map(fav => {
                  const model = allModels.find(m => m.id === fav.modelId);
                  return (
                    <button
                      key={fav.modelId}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-left group"
                      onClick={() => model && setSelectedModel(model)}
                    >
                      <Star
                        className="w-4 h-4 text-yellow-500 fill-yellow-500 shrink-0 cursor-pointer hover:scale-110 transition-transform"
                        onClick={(e) => { e.stopPropagation(); toggleFavoriteMutation.mutate(fav.modelId); }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{model?.name || fav.modelId}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{fav.modelId}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
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
            {compareIds.size > 0 && (
              <div className="flex items-center gap-3 pt-3">
                <span className="text-sm text-muted-foreground">{compareIds.size} selected</span>
                <Button
                  variant="glow"
                  size="sm"
                  className="text-white"
                  disabled={compareIds.size < 2}
                  onClick={() => setCompareOpen(true)}
                >
                  Compare{compareIds.size >= 2 ? ` (${compareIds.size})` : ""}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCompareIds(new Set())}>
                  Clear
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {modelsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 border-border">
                      <TableHead className="w-8"></TableHead>
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
                        <TableCell className="w-8 pr-0">
                          <input
                            type="checkbox"
                            className="accent-[hsl(var(--log-green))] w-3.5 h-3.5 cursor-pointer"
                            checked={compareIds.has(m.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const next = new Set(compareIds);
                              if (e.target.checked) {
                                if (next.size < 4) next.add(m.id);
                              } else {
                                next.delete(m.id);
                              }
                              setCompareIds(next);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {userHasKey && (
                              <Star
                                className={`w-4 h-4 shrink-0 cursor-pointer transition-colors ${favoriteIds.has(m.id) ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/30 hover:text-yellow-500"}`}
                                onClick={(e) => { e.stopPropagation(); toggleFavoriteMutation.mutate(m.id); }}
                              />
                            )}
                            <div>
                              <p className="font-medium text-foreground">{m.name || m.id}</p>
                              <p className="text-xs text-muted-foreground font-mono">{m.id}</p>
                            </div>
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
                            {getLastUsed(m.id) ? formatRelativeOrLocal(getLastUsed(m.id)!) : "—"}
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

        {/* Comparison dialog */}
        <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Compare Models</DialogTitle>
              <DialogDescription>Side-by-side comparison of selected models.</DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2 text-muted-foreground font-medium">Property</th>
                    {Array.from(compareIds).map(id => {
                      const m = allModels.find(mod => mod.id === id);
                      return (
                        <th key={id} className="text-left p-2 text-foreground font-medium min-w-[150px]">
                          {m?.name || id}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">ID</td>
                    {Array.from(compareIds).map(id => (
                      <td key={id} className="p-2 font-mono text-xs text-foreground">{id}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">Context Length</td>
                    {Array.from(compareIds).map(id => {
                      const m = allModels.find(mod => mod.id === id);
                      return <td key={id} className="p-2 text-foreground">{m?.context_length?.toLocaleString() ?? "—"}</td>;
                    })}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">Prompt (per 1K)</td>
                    {Array.from(compareIds).map(id => {
                      const m = allModels.find(mod => mod.id === id);
                      return <td key={id} className="p-2 text-foreground">{formatPrice(m?.pricing?.prompt)}</td>;
                    })}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">Completion (per 1K)</td>
                    {Array.from(compareIds).map(id => {
                      const m = allModels.find(mod => mod.id === id);
                      return <td key={id} className="p-2 text-foreground">{formatPrice(m?.pricing?.completion)}</td>;
                    })}
                  </tr>
                  {userHasKey && (
                    <>
                      <tr className="border-b border-border/50">
                        <td className="p-2 text-muted-foreground">Your Calls</td>
                        {Array.from(compareIds).map(id => {
                          const row = usageData?.costByModel?.find(r => r.model === id);
                          return <td key={id} className="p-2 text-foreground">{row?.totalCalls ?? 0}</td>;
                        })}
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="p-2 text-muted-foreground">Your Tokens</td>
                        {Array.from(compareIds).map(id => {
                          const row = usageData?.costByModel?.find(r => r.model === id);
                          return <td key={id} className="p-2 text-foreground">{(row?.totalTokens ?? 0).toLocaleString()}</td>;
                        })}
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="p-2 text-muted-foreground">Your Cost</td>
                        {Array.from(compareIds).map(id => {
                          const row = usageData?.costByModel?.find(r => r.model === id);
                          return <td key={id} className="p-2 text-foreground">
                            {row && row.totalCostCents > 0 ? `$${(row.totalCostCents / 10000).toFixed(4)}` : "$0.00"}
                          </td>;
                        })}
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="p-2 text-muted-foreground">Last Used</td>
                        {Array.from(compareIds).map(id => (
                          <td key={id} className="p-2 text-foreground text-sm">
                            {getLastUsed(id) ? formatRelativeOrLocal(getLastUsed(id)!) : "—"}
                          </td>
                        ))}
                      </tr>
                    </>
                  )}
                  <tr>
                    <td className="p-2 text-muted-foreground">Description</td>
                    {Array.from(compareIds).map(id => {
                      const m = allModels.find(mod => mod.id === id);
                      return <td key={id} className="p-2 text-foreground text-xs">{m?.description?.slice(0, 120) || "—"}{(m?.description?.length ?? 0) > 120 ? "…" : ""}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>

        {/* Replace all integrations confirmation */}
        <Dialog open={replaceAllConfirmOpen} onOpenChange={setReplaceAllConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-foreground">Replace all active integrations?</DialogTitle>
              <DialogDescription>
                Every active integration will use{" "}
                <span className="font-medium text-foreground">
                  {getAiModelDisplayName(defaultModelId || savedPreferredModel)}
                </span>
                {" "}for commit summaries. This will also set it as your default for new integrations.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReplaceAllConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-log-green hover:bg-log-green/90"
                disabled={replaceAllIntegrationsMutation.isPending}
                onClick={() => replaceAllIntegrationsMutation.mutate(defaultModelId || savedPreferredModel)}
              >
                {replaceAllIntegrationsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Replace all"}
              </Button>
            </div>
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
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Last used</p>
                      <p className="font-medium text-foreground">{formatCreatedAt(getLastUsed(selectedModel.id)!)}</p>
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
