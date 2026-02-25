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
import { Key, Sparkles, CheckCircle2, Loader2, Trash2, DollarSign, Zap, ExternalLink, RefreshCw, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY } from "@/lib/profile";
import { useToast } from "@/hooks/use-toast";
import { getAiModelDisplayName } from "@/lib/utils";
import { formatLocalDateTime, formatRelativeOrLocal, formatLocalShortDate } from "@/lib/date";
import { Link } from "wouter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { UseMutationResult } from "@tanstack/react-query";

// ——— OpenAI cost display (internal pricing map) ———
const DEFAULT_SUMMARY_INPUT_TOKENS = 1200;
const DEFAULT_SUMMARY_OUTPUT_TOKENS = 300;

const OPENAI_PRICING: Record<string, { inputPer1MUsd: number; outputPer1MUsd: number }> = {
  "gpt-3.5-turbo": { inputPer1MUsd: 0.5, outputPer1MUsd: 1.5 },
  "gpt-4": { inputPer1MUsd: 30, outputPer1MUsd: 60 },
  "gpt-4-turbo": { inputPer1MUsd: 10, outputPer1MUsd: 30 },
  "gpt-4o": { inputPer1MUsd: 2.5, outputPer1MUsd: 10 },
  "gpt-4o-mini": { inputPer1MUsd: 0.15, outputPer1MUsd: 0.6 },
  "gpt-4.1": { inputPer1MUsd: 2.5, outputPer1MUsd: 10 },
  "gpt-4.1-mini": { inputPer1MUsd: 0.4, outputPer1MUsd: 1.6 },
  "gpt-4.1-nano": { inputPer1MUsd: 0.1, outputPer1MUsd: 0.4 },
  "gpt-5.2": { inputPer1MUsd: 2.5, outputPer1MUsd: 10 },
  "gpt-5.1": { inputPer1MUsd: 2, outputPer1MUsd: 8 },
  "o1": { inputPer1MUsd: 15, outputPer1MUsd: 60 },
  "o1-mini": { inputPer1MUsd: 3, outputPer1MUsd: 12 },
  "o3": { inputPer1MUsd: 4, outputPer1MUsd: 16 },
  "o3-mini": { inputPer1MUsd: 1.1, outputPer1MUsd: 4.4 },
  "o4-mini": { inputPer1MUsd: 1.1, outputPer1MUsd: 4.4 },
};

type OpenAiTier = "premium" | "balanced" | "budget";

function deriveTierFromPricing(inputPer1M: number, outputPer1M: number): OpenAiTier {
  const avg = (inputPer1M + outputPer1M) / 2;
  if (avg >= 15) return "premium";
  if (avg >= 1) return "balanced";
  return "budget";
}

function formatSummaryUsd(n: number): string {
  if (n === 0) return "$0.000";
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function getOpenAiPricing(modelId: string): { inputPer1MUsd: number; outputPer1MUsd: number } | undefined {
  const id = modelId.toLowerCase();
  if (OPENAI_PRICING[id]) return OPENAI_PRICING[id];
  const prefixMatch = Object.keys(OPENAI_PRICING)
    .filter((k) => id === k || id.startsWith(k + "-"))
    .sort((a, b) => b.length - a.length)[0];
  return prefixMatch ? OPENAI_PRICING[prefixMatch] : undefined;
}

function getEffectiveOpenAiPricing(
  modelId: string,
  info: { promptPer1M?: number; completionPer1M?: number } | undefined
): { inputPer1MUsd: number; outputPer1MUsd: number } | undefined {
  if (info?.promptPer1M != null && info?.completionPer1M != null)
    return { inputPer1MUsd: info.promptPer1M, outputPer1MUsd: info.completionPer1M };
  return getOpenAiPricing(modelId);
}

function estimatePromptCompletionCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): { promptUsd: number; completionUsd: number } | null {
  const p = getOpenAiPricing(modelId);
  if (!p) return null;
  const promptUsd = (promptTokens / 1_000_000) * p.inputPer1MUsd;
  const completionUsd = (completionTokens / 1_000_000) * p.outputPer1MUsd;
  return { promptUsd, completionUsd };
}

function costPer1MShort(p: { inputPer1MUsd: number; outputPer1MUsd: number }): string {
  return `$${p.inputPer1MUsd.toFixed(2)} / $${p.outputPer1MUsd.toFixed(2)}`;
}

const TIER_LABELS: Record<OpenAiTier, string> = { premium: "Premium", balanced: "Balanced", budget: "Budget" };
const TIER_DOT_CLASS: Record<OpenAiTier, string> = {
  premium: "bg-red-500",
  balanced: "bg-yellow-500",
  budget: "bg-emerald-500",
};

function summaryCostFromPricing(
  p: { inputPer1MUsd: number; outputPer1MUsd: number },
  inTokens: number = DEFAULT_SUMMARY_INPUT_TOKENS,
  outTokens: number = DEFAULT_SUMMARY_OUTPUT_TOKENS
): number {
  return (inTokens / 1_000_000) * p.inputPer1MUsd + (outTokens / 1_000_000) * p.outputPer1MUsd;
}

interface OpenAiModel {
  id: string;
  name?: string;
}

interface OpenAiModelDetail {
  id: string;
  name: string;
  description?: string;
  promptPer1M?: number;
  completionPer1M?: number;
  contextLength?: number;
  tags?: string[];
}

interface OpenAiModelInfo {
  description?: string;
  promptPer1M?: number;
  completionPer1M?: number;
  contextLength?: number;
  tags?: string[];
}

const RECENT_CALLS_PAGE_SIZE = 15;

interface ProfileUserForModels {
  preferredAiModel?: string;
  monthlyBudget?: number | null;
  overBudgetBehavior?: "free_model" | "skip_ai";
}

interface OpenAIModelsProps {
  userHasOpenAiKey: boolean;
  profileLoading: boolean;
  profileUser?: ProfileUserForModels | undefined;
  savedPreferredModel: string;
  recommendedOpenai: string | null;
  integrations: { id: string | number; repositoryName: string; slackChannelName: string; aiModel?: string }[] | undefined;
  applyToIntegrationId: string;
  setApplyToIntegrationId: (id: string) => void;
  applyToIntegrationMutation: UseMutationResult<
    unknown,
    Error,
    { integrationId: string; modelId: string }
  >;
  setDefaultModelMutation: UseMutationResult<unknown, Error, string>;
  setReplaceAllConfirmOpen: (open: boolean) => void;
  setReplaceAllModelId: (id: string) => void;
  replaceAllIntegrationsMutation: UseMutationResult<unknown, Error, string>;
}

interface OpenRouterUsageLike {
  totalCalls: number;
  totalTokens: number;
  totalCostCents: number;
  totalCostFormatted: string | null;
  costByModel?: { model: string; totalCalls: number; totalTokens: number; totalCostCents: number; lastAt: string | null }[];
  calls: unknown[];
}

function getOpenAiModelInfo(
  details: OpenAiModelDetail[],
  id: string
): OpenAiModelInfo | undefined {
  const lid = id.toLowerCase();
  const exact = details.find((d) => d.id === id || d.id.toLowerCase() === lid);
  if (exact)
    return {
      description: exact.description,
      promptPer1M: exact.promptPer1M,
      completionPer1M: exact.completionPer1M,
      contextLength: exact.contextLength,
      tags: exact.tags,
    };
  const prefixMatch = details
    .filter(
      (d) =>
        id === d.id ||
        id.startsWith(d.id + "-") ||
        lid.startsWith(d.id.toLowerCase() + "-") ||
        d.id.startsWith(id + "-") ||
        d.id.startsWith(id + ".") ||
        d.id.toLowerCase().startsWith(lid + "-") ||
        d.id.toLowerCase().startsWith(lid + ".")
    )
    .sort((a, b) => b.id.length - a.id.length)[0];
  if (prefixMatch)
    return {
      description: prefixMatch.description,
      promptPer1M: prefixMatch.promptPer1M,
      completionPer1M: prefixMatch.completionPer1M,
      contextLength: prefixMatch.contextLength,
      tags: prefixMatch.tags,
    };
  return undefined;
}

export function OpenAIModels({
  userHasOpenAiKey,
  profileLoading,
  profileUser,
  savedPreferredModel,
  recommendedOpenai,
  integrations,
  applyToIntegrationId,
  setApplyToIntegrationId,
  applyToIntegrationMutation,
  setDefaultModelMutation,
  setReplaceAllConfirmOpen,
  setReplaceAllModelId,
  replaceAllIntegrationsMutation,
}: OpenAIModelsProps) {
  const [openaiApiKeyInput, setOpenaiApiKeyInput] = useState("");
  const [selectedOpenAiModel, setSelectedOpenAiModel] = useState<OpenAiModel | null>(null);
  const [defaultModelId, setDefaultModelId] = useState<string>("");
  const [recentCallsOpen, setRecentCallsOpen] = useState(false);
  const [recentCallsModelFilter, setRecentCallsModelFilter] = useState<string>("");
  const [recentCallsSearch, setRecentCallsSearch] = useState("");
  const [recentCallsPage, setRecentCallsPage] = useState(0);
  const [budgetInput, setBudgetInput] = useState("");
  const [viewingCall, setViewingCall] = useState<{
    id: string;
    model?: string;
    tokensUsed?: number;
    tokensPrompt?: number | null;
    tokensCompletion?: number | null;
    cost?: number;
    costFormatted?: string | null;
    createdAt?: string | null;
  } | null>(null);
  const [quickApplyModelId, setQuickApplyModelId] = useState<string>("");
  const [quickApplyModelOpen, setQuickApplyModelOpen] = useState(false);
  const [defaultModelOpen, setDefaultModelOpen] = useState(false);
  const [browseModelsSearch, setBrowseModelsSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: openaiModelsData, isLoading: openaiModelsLoading } = useQuery<{ models: OpenAiModel[] }>({
    queryKey: ["/api/openai/models"],
    queryFn: async () => {
      const res = await fetch("/api/openai/models", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch OpenAI models");
      return res.json();
    },
    enabled: true,
  });
  const openaiModels = openaiModelsData?.models ?? [];

  const { data: openaiDetailsData } = useQuery<{ details: OpenAiModelDetail[] }>({
    queryKey: ["/api/openai/model-details"],
    queryFn: async () => {
      const res = await fetch("/api/openai/model-details", { credentials: "include" });
      if (!res.ok) return { details: [] };
      return res.json();
    },
    enabled: userHasOpenAiKey,
  });
  const openaiDetails = openaiDetailsData?.details ?? [];

  const { data: openaiUsageData, isLoading: openaiUsageLoading, isError: openaiUsageError, refetch: refetchOpenaiUsage } = useQuery<OpenRouterUsageLike>({
    queryKey: ["/api/openai/usage"],
    queryFn: async () => {
      const res = await fetch("/api/openai/usage", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load usage");
      const data = await res.json();
      return {
        totalCalls: data.totalCalls ?? 0,
        totalTokens: data.totalTokens ?? 0,
        totalCostCents: data.totalCostCents ?? 0,
        totalCostFormatted: data.totalCostFormatted ?? null,
        costByModel: Array.isArray(data.costByModel) ? data.costByModel : undefined,
        calls: Array.isArray(data.calls) ? data.calls : [],
      };
    },
    enabled: userHasOpenAiKey,
    retry: 1,
  });

  const { data: dailyUsageData } = useQuery<{ date: string; totalCost: number; callCount: number }[]>({
    queryKey: ["/api/openai/usage/daily"],
    queryFn: async () => {
      const res = await fetch("/api/openai/usage/daily", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load daily usage");
      return res.json();
    },
    enabled: userHasOpenAiKey,
    retry: 1,
  });

  const { data: monthlySpendData } = useQuery<{ totalSpend: number; totalSpendUsd: number; callCount: number }>({
    queryKey: ["/api/openai/monthly-spend"],
    queryFn: async () => {
      const res = await fetch("/api/openai/monthly-spend", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load monthly spend");
      return res.json();
    },
    enabled: userHasOpenAiKey,
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
      queryClient.invalidateQueries({ queryKey: ["/api/openai/monthly-spend"] });
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
        description:
          behavior === "skip_ai"
            ? "When over budget, AI summaries will be paused (plain push only)."
            : "When over budget, summaries will use the free model.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    },
  });

  const deleteUsageMutation = useMutation({
    mutationFn: async (usageId: string) => {
      const res = await apiRequest("DELETE", `/api/openai/usage/${encodeURIComponent(usageId)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to delete");
      }
      return res.json();
    },
    onSuccess: (_, usageId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/openai/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/openai/usage/daily"] });
      queryClient.invalidateQueries({ queryKey: ["/api/openai/monthly-spend"] });
      setViewingCall(null);
      toast({ title: "Deleted", description: "Call removed from history." });
    },
    onError: (e: Error) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    },
  });

  const handleViewCall = (call: { id?: string; model?: string; tokensUsed?: number; tokensPrompt?: number | null; tokensCompletion?: number | null; cost?: number; costFormatted?: string; createdAt?: string }) => {
    setViewingCall({
      id: String(call.id ?? ""),
      model: call.model,
      tokensUsed: call.tokensUsed,
      tokensPrompt: call.tokensPrompt ?? null,
      tokensCompletion: call.tokensCompletion ?? null,
      cost: call.cost,
      costFormatted: call.costFormatted ?? null,
      createdAt: call.createdAt ?? null,
    });
  };

  const verifyOpenAiMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await fetch("/api/openai/verify", {
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

  const saveOpenAiKeyMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("POST", "/api/openai/key", { apiKey: key.trim() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      setOpenaiApiKeyInput("");
      toast({ title: "API key saved", description: "Your OpenAI key is stored securely." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to save key", description: e.message, variant: "destructive" });
    },
  });

  const removeOpenAiKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/openai/key");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      toast({ title: "API key removed", description: "You can add a new key anytime." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to remove key", description: e.message, variant: "destructive" });
    },
  });

  const handleVerifyAndSaveOpenAi = () => {
    const key = openaiApiKeyInput.trim();
    if (!key) {
      toast({ title: "Enter your key", description: "Paste your OpenAI API key first.", variant: "destructive" });
      return;
    }
    verifyOpenAiMutation.mutate(key, {
      onSuccess: () => {
        saveOpenAiKeyMutation.mutate(key);
      },
    });
  };

  const getInfo = (id: string) => getOpenAiModelInfo(openaiDetails, id);

  const [usageRefreshing, setUsageRefreshing] = useState(false);
  const handleRefreshUsage = () => {
    setUsageRefreshing(true);
    refetchOpenaiUsage().finally(() => setUsageRefreshing(false));
  };

  return (
    <>
      <Card className="card-lift mb-8 border-border shadow-forest">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Key className="w-5 h-5 text-log-green" />
            OpenAI API Key
          </CardTitle>
          <CardDescription>
            Add your key from{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-log-green hover:underline"
            >
              platform.openai.com/api-keys
            </a>{" "}
            to use OpenAI models for commit summaries. Usage is billed to your OpenAI account. Your key is stored encrypted and never shared.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {profileLoading ? (
            <Skeleton className="h-10 w-full max-w-md" />
          ) : userHasOpenAiKey ? (
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
                  disabled={removeOpenAiKeyMutation.isPending}
                  onClick={() => removeOpenAiKeyMutation.mutate()}
                >
                  {removeOpenAiKeyMutation.isPending ? (
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
                , open the <span className="font-medium text-foreground">⋮ menu</span> on an integration and pick an OpenAI model.
              </p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
              <Input
                type="password"
                placeholder="sk-..."
                value={openaiApiKeyInput}
                onChange={(e) => setOpenaiApiKeyInput(e.target.value)}
                autoComplete="off"
                className="font-mono bg-background border-border text-foreground"
              />
              <Button
                variant="glow"
                className="text-white shrink-0"
                disabled={!openaiApiKeyInput.trim() || verifyOpenAiMutation.isPending || saveOpenAiKeyMutation.isPending}
                onClick={handleVerifyAndSaveOpenAi}
              >
                {(verifyOpenAiMutation.isPending || saveOpenAiKeyMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Verify & Save"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {userHasOpenAiKey && (
        <Card className="card-lift mb-8 border-border shadow-forest">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Zap className="w-5 h-5 text-log-green" />
              Apply a model to an integration
            </CardTitle>
            <CardDescription>
              Select a model and an integration to use it for commit summaries—no need to scroll the table.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[180px] max-w-sm">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Model</Label>
                <Popover open={quickApplyModelOpen} onOpenChange={setQuickApplyModelOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between bg-background border-border text-foreground font-normal"
                    >
                      {quickApplyModelId ? getAiModelDisplayName(quickApplyModelId) : (openaiModelsLoading ? "Loading…" : "Choose model")}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command
                      filter={(value, search) => {
                        const display = getAiModelDisplayName(value);
                        const s = search.toLowerCase();
                        return (value.toLowerCase().includes(s) || display.toLowerCase().includes(s)) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Search models…" />
                      <CommandList>
                        <CommandEmpty>No model found.</CommandEmpty>
                        <CommandGroup>
                          {openaiModels.map((m) => (
                            <CommandItem
                              key={m.id}
                              value={m.id}
                              onSelect={() => {
                                setQuickApplyModelId(m.id);
                                setQuickApplyModelOpen(false);
                              }}
                            >
                              <span className="flex items-center gap-2">
                                {getAiModelDisplayName(m.id)}
                                {recommendedOpenai === m.id && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-log-green/20 text-log-green font-medium">Recommended</span>
                                )}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        {!openaiModelsLoading && openaiModels.length === 0 && (
                          <div className="py-4 px-2 text-sm text-muted-foreground text-center">No models available</div>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex-1 min-w-[180px] max-w-sm">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Integration</Label>
                <Select value={applyToIntegrationId} onValueChange={setApplyToIntegrationId}>
                  <SelectTrigger className="w-full bg-background border-border text-foreground">
                    <SelectValue placeholder="Choose integration…" />
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
                disabled={!quickApplyModelId || !applyToIntegrationId || applyToIntegrationMutation.isPending}
                onClick={() => {
                  if (!quickApplyModelId || !applyToIntegrationId) return;
                  const int = integrations?.find((i) => String(i.id) === applyToIntegrationId);
                  if (int?.aiModel === quickApplyModelId) {
                    toast({
                      title: "Already using this model",
                      description: `This integration already uses ${getAiModelDisplayName(quickApplyModelId)}.`,
                      variant: "default",
                    });
                    return;
                  }
                  applyToIntegrationMutation.mutate(
                    { integrationId: applyToIntegrationId, modelId: quickApplyModelId },
                    { onSuccess: () => setQuickApplyModelId("") }
                  );
                }}
              >
                {applyToIntegrationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
            {integrations?.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No integrations yet. Create one from <Link href="/dashboard" className="text-log-green hover:underline">Dashboard</Link> or{" "}
                <Link href="/integrations" className="text-log-green hover:underline">Integrations</Link>.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {userHasOpenAiKey && (
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
              {(() => {
                const effectiveDefaultId =
                  defaultModelId ||
                  (savedPreferredModel && openaiModels.some((m) => m.id === savedPreferredModel) ? savedPreferredModel : "") ||
                  (recommendedOpenai && openaiModels.some((m) => m.id === recommendedOpenai) ? recommendedOpenai : "");
                return (
              <Popover open={defaultModelOpen} onOpenChange={setDefaultModelOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full sm:max-w-md justify-between bg-background border-border text-foreground font-normal"
                  >
                    {effectiveDefaultId ? getAiModelDisplayName(effectiveDefaultId) : (openaiModelsLoading ? "Loading models…" : "Select default model")}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command
                    filter={(value, search) => {
                      const display = getAiModelDisplayName(value);
                      const s = search.toLowerCase();
                      return (value.toLowerCase().includes(s) || display.toLowerCase().includes(s)) ? 1 : 0;
                    }}
                  >
                    <CommandInput placeholder="Search models…" />
                    <CommandList>
                      <CommandEmpty>No model found.</CommandEmpty>
                      <CommandGroup>
                        {openaiModels.map((m) => (
                          <CommandItem
                            key={m.id}
                            value={m.id}
                            onSelect={() => {
                              setDefaultModelId(m.id);
                              setDefaultModelOpen(false);
                            }}
                          >
                            <span className="flex items-center gap-2">
                              {getAiModelDisplayName(m.id)}
                              {recommendedOpenai === m.id && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-log-green/20 text-log-green font-medium">Recommended</span>
                              )}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      {!openaiModelsLoading && openaiModels.length === 0 && (
                        <div className="py-4 px-2 text-sm text-muted-foreground text-center">No models available</div>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
                );
              })()}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="default"
                  className="bg-log-green hover:bg-log-green/90"
                  disabled={
                    !(
                      defaultModelId ||
                      (savedPreferredModel && openaiModels.some((m) => m.id === savedPreferredModel) ? savedPreferredModel : "") ||
                      (recommendedOpenai && openaiModels.some((m) => m.id === recommendedOpenai) ? recommendedOpenai : "")
                    ) || setDefaultModelMutation.isPending
                  }
                  onClick={() => {
                    const val =
                      defaultModelId ||
                      (savedPreferredModel && openaiModels.some((m) => m.id === savedPreferredModel) ? savedPreferredModel : "") ||
                      (recommendedOpenai && openaiModels.some((m) => m.id === recommendedOpenai) ? recommendedOpenai : "");
                    if (val) setDefaultModelMutation.mutate(val);
                  }}
                >
                  {setDefaultModelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set as default"}
                </Button>
                <Button
                  variant="outline"
                  className="border-border"
                  disabled={
                    !(
                      defaultModelId ||
                      (savedPreferredModel && openaiModels.some((m) => m.id === savedPreferredModel) ? savedPreferredModel : "") ||
                      (recommendedOpenai && openaiModels.some((m) => m.id === recommendedOpenai) ? recommendedOpenai : "")
                    ) || replaceAllIntegrationsMutation.isPending || !integrations?.length
                  }
                  onClick={() => {
                    const val =
                      defaultModelId ||
                      (savedPreferredModel && openaiModels.some((m) => m.id === savedPreferredModel) ? savedPreferredModel : "") ||
                      (recommendedOpenai && openaiModels.some((m) => m.id === recommendedOpenai) ? recommendedOpenai : "");
                    setReplaceAllModelId(val || "");
                    setReplaceAllConfirmOpen(true);
                  }}
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

      {userHasOpenAiKey && (
        <Card className="card-lift mb-8 border-border shadow-forest">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-foreground">
                <DollarSign className="w-5 h-5 text-log-green" />
                Usage & cost
              </CardTitle>
              <button
                onClick={handleRefreshUsage}
                disabled={usageRefreshing}
                className="text-muted-foreground hover:text-log-green transition-colors duration-200 disabled:opacity-40 p-1.5 rounded-md hover:bg-muted/50"
                title="Refresh usage"
              >
                <RefreshCw className={`w-4 h-4 ${usageRefreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
            <CardDescription>
              Calls and token usage from PushLog using your OpenAI key. Cost is estimated from our recorded usage when available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {openaiUsageLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : openaiUsageError ? (
              <p className="text-sm text-muted-foreground">Could not load usage. You can still browse and apply models below.</p>
            ) : openaiUsageData ? (
              <>
                {integrations && integrations.some((i) => i.aiModel && !i.aiModel.includes("/")) && (
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
                            .filter((i) => i.aiModel && !i.aiModel.includes("/"))
                            .map((i) => (
                              <TableRow key={i.id} className="border-border">
                                <TableCell className="font-medium text-foreground">{i.repositoryName} → #{i.slackChannelName}</TableCell>
                                <TableCell className="text-muted-foreground">{getAiModelDisplayName(i.aiModel!)}</TableCell>
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
                    <p className="text-xl font-semibold text-foreground">{openaiUsageData.totalCalls ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total tokens</p>
                    <p className="text-xl font-semibold text-foreground">{(openaiUsageData.totalTokens ?? 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Estimated cost</p>
                    <p className="text-xl font-semibold text-foreground">{openaiUsageData.totalCostFormatted ?? "—"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Monthly spend</p>
                    <p className="text-xl font-semibold text-foreground">
                      {monthlySpendData != null ? `$${monthlySpendData.totalSpendUsd.toFixed(4)}` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">this month</p>
                  </div>
                </div>
                {openaiUsageData.costByModel && openaiUsageData.costByModel.length > 0 && openaiUsageData.totalCalls > 0 && (
                  <div className="flex flex-wrap gap-3 mb-6">
                    <div className="flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-sm">
                      <span className="text-muted-foreground">Avg/call:</span>
                      <span className="font-medium text-foreground">
                        ${(openaiUsageData.totalCostCents / openaiUsageData.totalCalls / 10000).toFixed(4)}
                      </span>
                    </div>
                  </div>
                )}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-foreground mb-3">Cost over time (last 30 days)</h4>
                    <ChartContainer config={{ count: { label: "Cost", color: "hsl(var(--log-green))" } }} className="h-[180px] w-full">
                      <AreaChart
                        data={dailyUsageData?.map((d) => ({
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
                        <Area
                          type="monotone"
                          dataKey="costUsd"
                          name="Cost ($)"
                          stroke="hsl(var(--log-green))"
                          fill="hsl(var(--log-green) / 0.15)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ChartContainer>
                  </div>

                {Array.isArray(openaiUsageData.calls) && openaiUsageData.calls.length > 0 ? (
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
                          {(openaiUsageData.costByModel ?? []).map((r) => (
                            <TableRow key={r.model} className="border-border">
                              <TableCell className="font-medium text-foreground">{getAiModelDisplayName(r.model)}</TableCell>
                              <TableCell className="text-muted-foreground">{r.totalCalls}</TableCell>
                              <TableCell className="text-muted-foreground">{(r.totalTokens ?? 0).toLocaleString()}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {r.totalCostCents != null && r.totalCostCents > 0
                                  ? `$${(r.totalCostCents / 10000).toFixed(4)}`
                                  : r.totalCostCents === 0
                                    ? "$0.00"
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
                            <span className="text-muted-foreground font-normal text-xs ml-1">({openaiUsageData.calls.length})</span>
                          </Button>
                        </CollapsibleTrigger>
                        <Select
                          value={recentCallsModelFilter || "all"}
                          onValueChange={(v) => {
                            setRecentCallsModelFilter(v === "all" ? "" : v);
                            setRecentCallsPage(0);
                          }}
                        >
                          <SelectTrigger className="w-[200px] h-8 text-sm bg-background border-border text-foreground">
                            <SelectValue placeholder="All models" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All models</SelectItem>
                            {Array.from(new Set((openaiUsageData.calls as { model?: string }[]).map((c) => c.model))).filter(Boolean).sort().map((m) => (
                              <SelectItem key={m!} value={m!}>
                                {getAiModelDisplayName(m!)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="relative flex-1 min-w-[140px] max-w-[220px]">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Search calls…"
                            value={recentCallsSearch}
                            onChange={(e) => {
                              setRecentCallsSearch(e.target.value);
                              setRecentCallsPage(0);
                            }}
                            className="h-8 pl-8 text-sm bg-background border-border text-foreground"
                          />
                        </div>
                      </div>
                      <CollapsibleContent>
                        {(() => {
                          const calls = openaiUsageData.calls as { id?: string; model?: string; tokensUsed?: number; cost?: number; costFormatted?: string; createdAt?: string }[];
                          const filteredRecentCalls = calls
                            .filter((c) => !recentCallsModelFilter || c.model === recentCallsModelFilter)
                            .filter((c) => {
                              if (!recentCallsSearch.trim()) return true;
                              const q = recentCallsSearch.toLowerCase();
                              return (
                                (c.model ?? "").toLowerCase().includes(q) ||
                                getAiModelDisplayName(c.model ?? "").toLowerCase().includes(q) ||
                                (c.costFormatted ?? "").toLowerCase().includes(q) ||
                                String(c.tokensUsed ?? "").includes(q)
                              );
                            });
                          const totalPages = Math.max(1, Math.ceil(filteredRecentCalls.length / RECENT_CALLS_PAGE_SIZE));
                          const pageIndex = Math.min(recentCallsPage, totalPages - 1);
                          const paginatedCalls = filteredRecentCalls.slice(
                            pageIndex * RECENT_CALLS_PAGE_SIZE,
                            (pageIndex + 1) * RECENT_CALLS_PAGE_SIZE
                          );
                          return (
                            <>
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
                                    {paginatedCalls.map((c, idx) => (
                                      <TableRow key={c.id ?? idx} className="border-border">
                                        <TableCell className="font-medium text-foreground text-sm">
                                          {getAiModelDisplayName(c.model ?? "")}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                          {(c.tokensUsed ?? 0).toLocaleString()}
                                        </TableCell>
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
                                          {c.createdAt ? formatLocalDateTime(c.createdAt) : "—"}
                                        </TableCell>
                                        <TableCell>
                                          {c.id ? (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 text-xs text-log-green hover:text-log-green/90"
                                              onClick={() => handleViewCall(c)}
                                              disabled={deleteUsageMutation.isPending && viewingCall?.id === c.id}
                                            >
                                              {deleteUsageMutation.isPending && viewingCall?.id === c.id ? (
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
                              {filteredRecentCalls.length === 0 && (
                                <p className="text-sm text-muted-foreground py-3">No calls match your filters.</p>
                              )}
                              {filteredRecentCalls.length > 0 && totalPages > 1 && (
                                <div className="flex items-center justify-between gap-2 mt-2 px-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1 border-border"
                                    disabled={pageIndex <= 0}
                                    onClick={() => setRecentCallsPage((p) => Math.max(0, p - 1))}
                                  >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                    Previous
                                  </Button>
                                  <span className="text-sm text-muted-foreground">
                                    Page {pageIndex + 1} of {totalPages}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1 border-border"
                                    disabled={pageIndex >= totalPages - 1}
                                    onClick={() => setRecentCallsPage((p) => Math.min(totalPages - 1, p + 1))}
                                  >
                                    Next
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No OpenAI calls yet. Use an integration with OpenAI to see usage here.</p>
                )}

                <div className="mb-6 mt-6 rounded-lg border border-border bg-muted/30 p-4">
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
                        : "When over budget, summaries will use the free model instead of your chosen model."}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={!!viewingCall}
        onOpenChange={(open) => {
          if (!open) setViewingCall(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Usage for this call</DialogTitle>
            <DialogDescription>
              Recorded for this OpenAI call{viewingCall?.id ? ` (${String(viewingCall.id).slice(0, 8)}…)` : ""}.
            </DialogDescription>
          </DialogHeader>
          {viewingCall && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium text-foreground">Cost:</span>{" "}
                {viewingCall.costFormatted != null && viewingCall.costFormatted !== ""
                  ? viewingCall.costFormatted
                  : typeof viewingCall.cost === "number"
                    ? viewingCall.cost === 0
                      ? "$0.00"
                      : `$${(viewingCall.cost / 10000).toFixed(4)}`
                    : "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">Tokens (prompt):</span>{" "}
                {viewingCall.tokensPrompt != null ? viewingCall.tokensPrompt.toLocaleString() : "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">Tokens (completion):</span>{" "}
                {viewingCall.tokensCompletion != null ? viewingCall.tokensCompletion.toLocaleString() : "—"}
              </p>
              {viewingCall.model && viewingCall.tokensPrompt != null && viewingCall.tokensCompletion != null && (() => {
                const est = estimatePromptCompletionCost(viewingCall.model, viewingCall.tokensPrompt, viewingCall.tokensCompletion);
                return est ? (
                  <p>
                    <span className="font-medium text-foreground">Token worth (est.):</span>{" "}
                    <span className="text-muted-foreground">
                      prompt ${est.promptUsd < 0.01 ? est.promptUsd.toFixed(4) : est.promptUsd.toFixed(3)}, completion ${est.completionUsd < 0.01 ? est.completionUsd.toFixed(4) : est.completionUsd.toFixed(3)}
                    </span>
                  </p>
                ) : null;
              })()}
              <p>
                <span className="font-medium text-foreground">Total tokens:</span>{" "}
                {(viewingCall.tokensUsed ?? 0).toLocaleString()}
              </p>
              <a
                href="https://platform.openai.com/usage"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-log-green hover:underline text-sm"
              >
                Open on OpenAI <ExternalLink className="w-3 h-3" />
              </a>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    refetchOpenaiUsage();
                    toast({ title: "Refreshed", description: "Usage data updated." });
                  }}
                >
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => viewingCall && deleteUsageMutation.mutate(viewingCall.id)}
                  disabled={deleteUsageMutation.isPending}
                >
                  {deleteUsageMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Delete from history
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card className="card-lift mb-8 border-border shadow-forest">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Zap className="w-5 h-5 text-log-green" />
              Browse OpenAI models
            </CardTitle>
            <CardDescription>
              Search by name or ID. Click a model for details and to set it as default.{" "}
              <a
                href="https://openai.com/api/pricing/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-log-green hover:underline font-medium"
              >
                View pricing on OpenAI <ExternalLink className="w-3 h-3 inline" />
              </a>
            </CardDescription>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or ID..."
                  value={browseModelsSearch}
                  onChange={(e) => setBrowseModelsSearch(e.target.value)}
                  className="pl-9 bg-background border-border text-foreground"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {openaiModelsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <>
                <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 border-border">
                      <TableHead className="text-foreground font-medium">Model</TableHead>
                      <TableHead className="text-foreground font-medium">Tier</TableHead>
                      <TableHead className="text-foreground font-medium">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dotted border-muted-foreground">
                                Est / summary
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              Estimated using {DEFAULT_SUMMARY_INPUT_TOKENS.toLocaleString()} input + {DEFAULT_SUMMARY_OUTPUT_TOKENS.toLocaleString()} output tokens per summary.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead className="text-foreground font-medium">1M tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const q = browseModelsSearch.trim().toLowerCase();
                      const filtered = !q
                        ? openaiModels
                        : openaiModels.filter(
                            (m) =>
                              m.id.toLowerCase().includes(q) || getAiModelDisplayName(m.id).toLowerCase().includes(q)
                          );
                      return filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            {openaiModels.length === 0
                              ? "No models available. Add your API key above."
                              : "No models match your search."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map((m) => {
                      const info = getInfo(m.id);
                      const effectivePricing = getEffectiveOpenAiPricing(m.id, info);
                      const hasPricing = !!effectivePricing;
                      const summaryCost = hasPricing ? summaryCostFromPricing(effectivePricing) : 0;
                      const tier = hasPricing ? deriveTierFromPricing(effectivePricing.inputPer1MUsd, effectivePricing.outputPer1MUsd) : null;
                      return (
                        <TableRow
                          key={m.id}
                          className="border-border cursor-pointer hover:bg-muted/50 transition-colors [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/70"
                          onClick={() => setSelectedOpenAiModel(m)}
                        >
                          <TableCell className="text-foreground font-medium">
                            <span className="inline-flex items-center gap-2 flex-wrap">
                              {getAiModelDisplayName(m.id)}
                              {recommendedOpenai === m.id && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-log-green/20 text-log-green font-medium">Recommended</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell>
                            {tier ? (
                              <span className="inline-flex items-center gap-1.5 text-foreground">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${TIER_DOT_CLASS[tier]}`} aria-hidden />
                                {TIER_LABELS[tier]}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-foreground">
                            {hasPricing ? `~${formatSummaryUsd(summaryCost)}` : "—"}
                          </TableCell>
                          <TableCell className="text-foreground">
                            {hasPricing ? costPer1MShort(effectivePricing) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                        })
                      );
                    })()}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </CardContent>
        </Card>

      <Dialog open={!!selectedOpenAiModel} onOpenChange={(open) => !open && setSelectedOpenAiModel(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedOpenAiModel && (() => {
            const info = getInfo(selectedOpenAiModel.id);
            const effectivePricing = getEffectiveOpenAiPricing(selectedOpenAiModel.id, info);
            const summaryCost = effectivePricing ? summaryCostFromPricing(effectivePricing) : 0;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl text-foreground flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-log-green" />
                    {getAiModelDisplayName(selectedOpenAiModel.id)}
                  </DialogTitle>
                  <DialogDescription className="font-mono text-xs text-muted-foreground">
                    {selectedOpenAiModel.id}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {info?.tags && info.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {info.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {info?.description && (
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {info?.contextLength != null && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Context length</p>
                        <p className="font-medium text-foreground">{info.contextLength.toLocaleString()}</p>
                      </div>
                    )}
                    {effectivePricing && (
                      <>
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Est. cost / 1M</p>
                          <p className="font-medium text-foreground">{costPer1MShort(effectivePricing)}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Est. / summary</p>
                          <p className="font-medium text-foreground">~{formatSummaryUsd(summaryCost)}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {DEFAULT_SUMMARY_INPUT_TOKENS.toLocaleString()} in + {DEFAULT_SUMMARY_OUTPUT_TOKENS.toLocaleString()} out tokens
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  <a
                    href="https://platform.openai.com/docs/models"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-log-green hover:underline"
                  >
                    View on OpenAI <ExternalLink className="w-4 h-4" />
                  </a>
                  <Separator className="my-4" />
                  {userHasOpenAiKey && (
                    <div className="space-y-4">
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
                              if (!applyToIntegrationId) return;
                              const int = integrations?.find((i) => String(i.id) === applyToIntegrationId);
                              if (int?.aiModel === selectedOpenAiModel.id) {
                                toast({
                                  title: "Already using this model",
                                  description: `This integration is already using ${getAiModelDisplayName(selectedOpenAiModel.id)}.`,
                                  variant: "default",
                                });
                                return;
                              }
                              applyToIntegrationMutation.mutate(
                                {
                                  integrationId: applyToIntegrationId,
                                  modelId: selectedOpenAiModel.id,
                                },
                                { onSuccess: () => setSelectedOpenAiModel(null) }
                              );
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
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Set as default model</p>
                        <p className="text-xs text-muted-foreground">New integrations will use this model by default.</p>
                        <Button
                          variant="outline"
                          className="border-border"
                          disabled={setDefaultModelMutation.isPending}
                          onClick={() => {
                            setDefaultModelMutation.mutate(selectedOpenAiModel.id);
                            setDefaultModelId(selectedOpenAiModel.id);
                            setSelectedOpenAiModel(null);
                          }}
                        >
                          {setDefaultModelMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Set as default"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
