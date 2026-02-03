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
import { Key, Sparkles, CheckCircle2, XCircle, Loader2, Trash2, Search, DollarSign, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/footer";
import { getAiModelDisplayName } from "@/lib/utils";

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

export default function Models() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [contextFilter, setContextFilter] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useQuery<{ success: boolean; user: ProfileUser }>({
    queryKey: ["/api/profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });
  const userHasKey = !!profile?.user?.hasOpenRouterKey;

  const { data: modelsData, isLoading: modelsLoading } = useQuery<{ models: OpenRouterModel[] }>({
    queryKey: ["/api/openrouter/models"],
    queryFn: async () => {
      const res = await fetch("/api/openrouter/models", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json();
    },
  });
  const allModels = modelsData?.models ?? [];

  const { data: usageData, isLoading: usageLoading } = useQuery<OpenRouterUsage>({
    queryKey: ["/api/openrouter/usage"],
    queryFn: async () => {
      const res = await fetch("/api/openrouter/usage", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load usage");
      return res.json();
    },
    enabled: userHasKey,
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
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
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
              ) : usageData ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Total calls</p>
                      <p className="text-xl font-semibold text-foreground">{usageData.totalCalls}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Total tokens</p>
                      <p className="text-xl font-semibold text-foreground">
                        {usageData.totalTokens.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Estimated cost</p>
                      <p className="text-xl font-semibold text-foreground">
                        {usageData.totalCostFormatted ?? "—"}
                      </p>
                    </div>
                  </div>
                  {usageData.calls.length > 0 ? (
                    <div className="rounded-md border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 border-border">
                            <TableHead className="text-foreground">Model</TableHead>
                            <TableHead className="text-foreground">Tokens</TableHead>
                            <TableHead className="text-foreground">Cost</TableHead>
                            <TableHead className="text-foreground">Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usageData.calls.map((c) => (
                            <TableRow key={c.id} className="border-border">
                              <TableCell className="font-medium text-foreground">
                                {getAiModelDisplayName(c.model)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{c.tokensUsed ?? "—"}</TableCell>
                              <TableCell className="text-muted-foreground">{c.costFormatted ?? "—"}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {new Date(c.createdAt).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
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
              Search and filter by name or context length. Use these model IDs when choosing a model in your integration settings.
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
                      <TableRow key={m.id} className="border-border">
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
      </main>
      <Footer />
    </div>
  );
}
