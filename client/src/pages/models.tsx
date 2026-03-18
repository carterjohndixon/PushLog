import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/profile";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/footer";
import { getAiModelDisplayName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, Loader2, Lock, ChevronDown, ChevronRight, Settings } from "lucide-react";
import { Link } from "wouter";
import { OpenAIModels } from "@/pages/OpenAIModels";
import { OpenRouterModels, type ProfileUserForModels } from "@/pages/OpenRouterModels";

type ModelsTab = "openrouter" | "openai";

const MODELS_TAB_STORAGE_KEY = "pushlog-models-tab";
const VALID_MODELS_TABS: readonly ModelsTab[] = ["openrouter", "openai"];
const DEFAULT_MODELS_TAB: ModelsTab = "openrouter";

function getStoredModelsTab(): ModelsTab {
  if (typeof window === "undefined") return DEFAULT_MODELS_TAB;
  try {
    const stored = localStorage.getItem(MODELS_TAB_STORAGE_KEY);
    if (stored !== null && (VALID_MODELS_TABS as readonly string[]).includes(stored)) {
      return stored as ModelsTab;
    }
  } catch {
    // localStorage disabled or quota exceeded
  }
  return DEFAULT_MODELS_TAB;
}

function setStoredModelsTab(tab: ModelsTab): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MODELS_TAB_STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}

type PushlogMode = "clean_summary" | "slack_friendly" | "detailed_engineering" | "executive_summary" | "incident_aware";

interface ModeCard {
  mode: PushlogMode;
  label: string;
  description: string;
  requiredPlan: "free" | "pro" | "team";
}

const MODE_CARDS: ModeCard[] = [
  { mode: "clean_summary", label: "Clean Summary", description: "Balanced developer-friendly summaries optimized for readability and signal.", requiredPlan: "free" },
  { mode: "slack_friendly", label: "Slack-Friendly", description: "Short, scannable summaries designed for quick reading in Slack.", requiredPlan: "pro" },
  { mode: "detailed_engineering", label: "Detailed Engineering", description: "Technical deep-dives with implementation details for engineers.", requiredPlan: "pro" },
  { mode: "executive_summary", label: "Executive Summary", description: "Non-technical summaries focused on business value and user outcomes.", requiredPlan: "pro" },
  { mode: "incident_aware", label: "Incident-Aware", description: "Risk-focused analysis highlighting potential production issues and breaking changes.", requiredPlan: "team" },
];

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, team: 2 };

function isModeAccessible(userPlan: string, requiredPlan: string): boolean {
  return (PLAN_RANK[userPlan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0);
}

interface IntegrationOption {
  id: string | number;
  repositoryName: string;
  slackChannelName: string;
  aiModel?: string;
}

interface ProfileUser extends ProfileUserForModels {
  id?: number;
  username?: string;
  hasOpenRouterKey?: boolean;
  hasOpenAiKey?: boolean;
  plan?: "free" | "pro" | "team";
}

export default function Models() {
  const [providerTab, setProviderTab] = useState<ModelsTab>(getStoredModelsTab);
  const [applyToIntegrationId, setApplyToIntegrationId] = useState<string>("");
  const [replaceAllConfirmOpen, setReplaceAllConfirmOpen] = useState(false);
  const [replaceAllModelId, setReplaceAllModelId] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<PushlogMode>("clean_summary");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const switchProviderTab = (tab: ModelsTab) => {
    setProviderTab(tab);
    setStoredModelsTab(tab);
  };

  const { data: profileResponse, isLoading: profileLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
  });
  const userHasKey = !!profileResponse?.user?.hasOpenRouterKey;
  const userHasOpenAiKey = !!profileResponse?.user?.hasOpenAiKey;
  const profileUser = profileResponse?.user as ProfileUser | undefined;
  const savedPreferredModel = profileUser?.preferredAiModel ?? "";

  const { data: recommendedData } = useQuery<{ openai: string | null; openrouter: string | null }>({
    queryKey: ["/api/recommended-models"],
    queryFn: async () => {
      const res = await fetch("/api/recommended-models", { credentials: "include" });
      if (!res.ok) return { openai: null, openrouter: null };
      return res.json();
    },
  });
  const recommendedOpenai = recommendedData?.openai ?? null;
  const recommendedOpenrouter = recommendedData?.openrouter ?? null;

  const { data: integrations } = useQuery<IntegrationOption[]>({
    queryKey: ["/api/integrations"],
    queryFn: async () => {
      const res = await fetch("/api/integrations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load integrations");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: userHasKey || userHasOpenAiKey,
  });

  const applyToIntegrationMutation = useMutation({
    mutationFn: async ({ integrationId, modelId }: { integrationId: string; modelId: string }) => {
      const id = typeof integrationId === "string" ? integrationId : String(integrationId);
      if (!id || id === "NaN" || id === "undefined") {
        throw new Error("Invalid integration. Please choose an integration again.");
      }
      const res = await apiRequest("PATCH", `/api/integrations/${id}`, { aiModel: modelId });
      return res.json();
    },
    onSuccess: (_, { modelId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/openrouter/usage"] });
      if (!modelId.includes("/")) queryClient.invalidateQueries({ queryKey: ["/api/openai/usage"] });
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

  const userPlan = profileUser?.plan ?? "free";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* PushLog Mode Selection */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-log-green" />
            Summary Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Choose how PushLog summarizes your code changes. Each mode uses a different AI approach.
          </p>

          <div className="grid gap-4 mt-6 sm:grid-cols-2 lg:grid-cols-3">
            {MODE_CARDS.map((card) => {
              const accessible = isModeAccessible(userPlan, card.requiredPlan);
              const isSelected = selectedMode === card.mode;
              return (
                <button
                  key={card.mode}
                  type="button"
                  disabled={!accessible}
                  onClick={() => accessible && setSelectedMode(card.mode)}
                  className={`relative text-left rounded-lg border p-4 transition-colors ${
                    isSelected
                      ? "border-log-green bg-log-green/5"
                      : accessible
                        ? "border-border bg-card hover:border-muted-foreground/40"
                        : "border-border bg-muted/30 opacity-70 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{card.label}</span>
                        {card.requiredPlan !== "free" && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {card.requiredPlan}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                    </div>
                    {!accessible && (
                      <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                  </div>
                  {!accessible && (
                    <div className="mt-3">
                      <Link href="/pricing" className="text-xs text-log-green hover:underline">
                        Upgrade to {card.requiredPlan}
                      </Link>
                    </div>
                  )}
                  {isSelected && accessible && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-log-green" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Advanced AI Engine Settings (collapsible) */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <Settings className="w-4 h-4" />
            Advanced AI Engine Settings
            {advancedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <CollapsibleContent>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Choose an AI provider and model. Your API key and model selection apply to all modes.
              </p>
              <div
                className="flex gap-2"
                role="tablist"
                aria-label="AI provider"
              >
                <button
                  type="button"
                  id="models-tab-openrouter"
                  role="tab"
                  aria-selected={providerTab === "openrouter"}
                  onClick={() => switchProviderTab("openrouter")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    providerTab === "openrouter"
                      ? "bg-log-green/15 border-log-green text-log-green"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  OpenRouter <span className="text-xs opacity-80">(recommended)</span>
                </button>
                <button
                  type="button"
                  id="models-tab-openai"
                  role="tab"
                  aria-selected={providerTab === "openai"}
                  onClick={() => switchProviderTab("openai")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    providerTab === "openai"
                      ? "bg-log-green/15 border-log-green text-log-green"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  OpenAI
                </button>
              </div>

              {providerTab === "openrouter" && (
                <div role="tabpanel" aria-labelledby="models-tab-openrouter">
                  <OpenRouterModels
                    userHasKey={userHasKey}
                    profileLoading={profileLoading}
                    profileUser={profileUser}
                    savedPreferredModel={savedPreferredModel}
                    recommendedOpenrouter={recommendedOpenrouter}
                    integrations={integrations}
                    applyToIntegrationId={applyToIntegrationId}
                    setApplyToIntegrationId={setApplyToIntegrationId}
                    applyToIntegrationMutation={applyToIntegrationMutation}
                    setDefaultModelMutation={setDefaultModelMutation}
                    setReplaceAllConfirmOpen={setReplaceAllConfirmOpen}
                    setReplaceAllModelId={setReplaceAllModelId}
                    replaceAllIntegrationsMutation={replaceAllIntegrationsMutation}
                  />
                </div>
              )}

              {providerTab === "openai" && (
                <div role="tabpanel" aria-labelledby="models-tab-openai">
                  <OpenAIModels
                    userHasOpenAiKey={userHasOpenAiKey}
                    profileLoading={profileLoading}
                    profileUser={profileUser}
                    savedPreferredModel={savedPreferredModel}
                    recommendedOpenai={recommendedOpenai}
                    integrations={integrations}
                    applyToIntegrationId={applyToIntegrationId}
                    setApplyToIntegrationId={setApplyToIntegrationId}
                    applyToIntegrationMutation={applyToIntegrationMutation}
                    setDefaultModelMutation={setDefaultModelMutation}
                    setReplaceAllConfirmOpen={setReplaceAllConfirmOpen}
                    setReplaceAllModelId={setReplaceAllModelId}
                    replaceAllIntegrationsMutation={replaceAllIntegrationsMutation}
                  />
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Dialog
          open={replaceAllConfirmOpen}
          onOpenChange={(open) => {
            setReplaceAllConfirmOpen(open);
            if (!open) setReplaceAllModelId("");
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-foreground">Replace all active integrations?</DialogTitle>
              <DialogDescription>
                Every active integration will use{" "}
                <span className="font-medium text-foreground">
                  {getAiModelDisplayName(replaceAllModelId)}
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
                disabled={replaceAllIntegrationsMutation.isPending || !replaceAllModelId}
                onClick={() => replaceAllIntegrationsMutation.mutate(replaceAllModelId)}
              >
                {replaceAllIntegrationsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Replace all"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
      <Footer />
    </div>
  );
}
