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
import { Key, Sparkles, CheckCircle2, Loader2, Trash2, Search, DollarSign, Zap, ExternalLink } from "lucide-react";
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
}

interface OpenRouterUsage {
  totalCalls: number;
  totalTokens: number;
  totalCostCents: number;
  totalCostFormatted: string | null;
  calls: UsageCall[];
}

interface IntegrationOption {
  id: number;
  repositoryName: string;
  slackChannelName: string;
  aiModel?: string;
}

export default function Models() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [contextFilter, setContextFilter] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<OpenRouterModel | null>(null);
  const [applyToIntegrationId, setApplyToIntegrationId] = useState<string>("");
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
        calls: Array.isArray(data.calls) ? data.calls : [],
      };
    },
    enabled: userHasKey,
    retry: 1,
  });

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
                Calls and token usage from PushLog using your OpenRouter key. Cost is estimated from our recorded usage.
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
                  </div>
                  {Array.isArray(usageData.calls) && usageData.calls.length > 0 ? (
                    (() => {
                      const byModel = usageData.calls.reduce<Record<string, { model: string; tokens: number; costCents: number; lastAt: string }>>((acc, c) => {
                        const m = c.model || "unknown";
                        const createdAt = c.createdAt ?? "";
                        if (!acc[m]) acc[m] = { model: m, tokens: 0, costCents: 0, lastAt: createdAt };
                        acc[m].tokens += c.tokensUsed ?? 0;
                        acc[m].costCents += c.cost ?? 0;
                        if (createdAt && (new Date(createdAt).getTime() > new Date(acc[m].lastAt).getTime())) acc[m].lastAt = createdAt;
                        return acc;
                      }, {});
                      const rows = Object.values(byModel).sort((a, b) => {
                        const tA = new Date(a.lastAt || 0).getTime();
                        const tB = new Date(b.lastAt || 0).getTime();
                        return tB - tA;
                      });
                      const formatLastUsed = (lastAt: string) => (lastAt ? formatLocalDateTime(lastAt) : "—");
                      return (
                        <div className="rounded-md border border-border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50 border-border">
                                <TableHead className="text-foreground">Model</TableHead>
                                <TableHead className="text-foreground">Tokens</TableHead>
                                <TableHead className="text-foreground">Cost</TableHead>
                                <TableHead className="text-foreground">Last used</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.map((r) => (
                                <TableRow key={r.model} className="border-border">
                                  <TableCell className="font-medium text-foreground">
                                    {getAiModelDisplayName(r.model)}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">{r.tokens.toLocaleString()}</TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {r.costCents != null
                                      ? r.costCents === 0
                                        ? "$0.00"
                                        : `$${(r.costCents / 100).toFixed(4)}`
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-sm">
                                    {formatLastUsed(r.lastAt)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })()
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
              Search and filter by name or context length. Click a model for details and to apply it to an integration.
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
                      <TableHead className="text-foreground hidden md:table-cell">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredModels.slice(0, 100).map((m) => (
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
