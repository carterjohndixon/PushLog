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
import { Key, Sparkles, CheckCircle2, Loader2, Trash2, DollarSign, Zap, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY } from "@/lib/profile";
import { useToast } from "@/hooks/use-toast";
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

interface OpenAIModelsProps {
  userHasOpenAiKey: boolean;
  profileLoading: boolean;
  savedPreferredModel: string;
  recommendedOpenai: string | null;
  integrations: { id: number; repositoryName: string; slackChannelName: string; aiModel?: string }[] | undefined;
  applyToIntegrationId: string;
  setApplyToIntegrationId: (id: string) => void;
  applyToIntegrationMutation: UseMutationResult<
    unknown,
    Error,
    { integrationId: number; modelId: string }
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: openaiModelsData, isLoading: openaiModelsLoading } = useQuery<{ models: OpenAiModel[] }>({
    queryKey: ["/api/openai/models"],
    queryFn: async () => {
      const res = await fetch("/api/openai/models", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch OpenAI models");
      return res.json();
    },
    enabled: userHasOpenAiKey,
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

  const { data: openaiUsageData, isLoading: openaiUsageLoading, isError: openaiUsageError } = useQuery<OpenRouterUsageLike>({
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

  return (
    <>
      <Card className="card-lift mb-8 border-border shadow-forest">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Key className="w-5 h-5 text-log-green" />
            OpenAI
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
        <CardContent className="space-y-6">
          {profileLoading ? (
            <Skeleton className="h-10 w-full max-w-md" />
          ) : userHasOpenAiKey ? (
            <div className="space-y-2">
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
                Configure which model an integration uses from{" "}
                <Link href="/integrations" className="text-log-green hover:underline">Integrations</Link>
                {" "}or{" "}
                <Link href="/dashboard" className="text-log-green hover:underline">Dashboard</Link>
                {" "}— open the <span className="font-medium text-foreground">⋮ menu</span> on an integration and pick an OpenAI model.
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

          {userHasOpenAiKey && (
            <>
              <Separator className="my-6" />
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium text-foreground">Default AI model</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This model is used for new integrations. Usage is billed to your OpenAI account.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <Select
                    value={
                      defaultModelId ||
                      (savedPreferredModel && openaiModels.some((m) => m.id === savedPreferredModel) ? savedPreferredModel : "") ||
                      (recommendedOpenai && openaiModels.some((m) => m.id === recommendedOpenai) ? recommendedOpenai : "") ||
                      ""
                    }
                    onValueChange={(v) => setDefaultModelId(v)}
                  >
                    <SelectTrigger className="w-full sm:max-w-md bg-background border-border text-foreground">
                      <SelectValue placeholder={openaiModelsLoading ? "Loading models…" : "Select default model"} />
                    </SelectTrigger>
                    <SelectContent>
                      {openaiModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span className="flex items-center gap-2">
                            {getAiModelDisplayName(m.id)}
                            {recommendedOpenai === m.id && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-log-green/20 text-log-green font-medium">Recommended</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                      {!openaiModelsLoading && openaiModels.length === 0 && (
                        <div className="py-4 px-2 text-sm text-muted-foreground text-center">No models available</div>
                      )}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="default"
                      className="bg-log-green hover:bg-log-green/90"
                      disabled={
                        !(
                          defaultModelId ||
                          (savedPreferredModel && openaiModels.some((m) => m.id === savedPreferredModel) ? savedPreferredModel : "") ||
                          (recommendedOpenai && openaiModels.some((m) => m.id === recommendedOpenai) ? recommendedOpenai : "")
                        ) ||
                        setDefaultModelMutation.isPending ||
                        !openaiModels.some((m) => m.id === (defaultModelId || savedPreferredModel || recommendedOpenai || ""))
                      }
                      onClick={() => {
                        const val =
                          defaultModelId ||
                          (savedPreferredModel && openaiModels.some((m) => m.id === savedPreferredModel) ? savedPreferredModel : "") ||
                          (recommendedOpenai && openaiModels.some((m) => m.id === recommendedOpenai) ? recommendedOpenai : "");
                        if (val && openaiModels.some((m) => m.id === val)) {
                          setDefaultModelMutation.mutate(val);
                        }
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
                        ) ||
                        replaceAllIntegrationsMutation.isPending ||
                        !integrations?.length ||
                        !openaiModels.some((m) => m.id === (defaultModelId || savedPreferredModel || recommendedOpenai || ""))
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
                {savedPreferredModel && openaiModels.some((m) => m.id === savedPreferredModel) && (
                  <p className="text-sm text-muted-foreground">
                    Current default: <span className="font-medium text-foreground">{getAiModelDisplayName(savedPreferredModel)}</span>
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {userHasOpenAiKey && (
        <Card className="card-lift mt-8 border-border shadow-forest">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <DollarSign className="w-5 h-5 text-log-green" />
              Usage & cost
            </CardTitle>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total calls</p>
                    <p className="text-xl font-semibold text-foreground">{openaiUsageData.totalCalls ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total tokens</p>
                    <p className="text-xl font-semibold text-foreground">
                      {(openaiUsageData.totalTokens ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Estimated cost</p>
                    <p className="text-xl font-semibold text-foreground">
                      {openaiUsageData.totalCostFormatted ?? "—"}
                    </p>
                  </div>
                </div>
                {openaiUsageData.costByModel && openaiUsageData.costByModel.length > 0 && (
                  <>
                    <h4 className="text-sm font-semibold text-foreground mb-2">Cost by model</h4>
                    <div className="rounded-md border border-border overflow-hidden">
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
                          {openaiUsageData.costByModel.map((r) => (
                            <TableRow key={r.model} className="border-border">
                              <TableCell className="font-medium text-foreground">{getAiModelDisplayName(r.model)}</TableCell>
                              <TableCell className="text-muted-foreground">{r.totalCalls}</TableCell>
                              <TableCell className="text-muted-foreground">{(r.totalTokens ?? 0).toLocaleString()}</TableCell>
                              <TableCell className="text-foreground">
                                {r.totalCostCents != null && r.totalCostCents > 0
                                  ? `$${(r.totalCostCents / 10000).toFixed(4)}`
                                  : r.totalCostCents === 0
                                    ? "$0.00"
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
                  </>
                )}
                {openaiUsageData.totalCalls === 0 && (
                  <p className="text-sm text-muted-foreground">No usage recorded yet. Usage will appear here after commit summaries are generated with OpenAI.</p>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      {userHasOpenAiKey && (
        <Card className="card-lift mt-8 mb-8 border-border shadow-forest">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Zap className="w-5 h-5 text-log-green" />
              Browse OpenAI models
            </CardTitle>
            <CardDescription>
              Click a model for details and to set it as default.{" "}
              <a
                href="https://openai.com/api/pricing/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground text-xs inline-flex items-center gap-0.5"
              >
                Pricing subject to change <ExternalLink className="w-3 h-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {openaiModelsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
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
                    {openaiModels.map((m) => {
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
                    })}
                  </TableBody>
                </Table>
                {openaiModels.length === 0 && (
                  <p className="text-sm text-muted-foreground p-6 text-center">No models available. Add your API key above.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                        <p className="text-sm font-medium text-foreground">Use this model for a repo</p>
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
                                  integrationId: Number(applyToIntegrationId),
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
