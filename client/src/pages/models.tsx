import { useState, useEffect } from "react";
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
import { Sparkles, Loader2, Lock, ChevronDown, ChevronRight, Settings, Eye, Check } from "lucide-react";
import { Link } from "wouter";
import { isPayingUiEnabled } from "@/lib/payingUi";
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
  example: { summary: string; impact: string; category: string; details: string };
}

const MODE_CARDS: ModeCard[] = [
  {
    mode: "clean_summary",
    label: "Clean Summary",
    description: "Balanced developer-friendly summaries optimized for readability and signal.",
    requiredPlan: "free",
    example: {
      summary: "Add user avatar upload with image cropping and S3 storage",
      impact: "medium",
      category: "Feature",
      details: "Introduces a new avatar upload flow in the profile settings page. Users can crop images before uploading. Files are stored in S3 with a signed-URL retrieval pattern. Adds a new /api/avatar endpoint and updates the user model with an avatarUrl field.",
    },
  },
  {
    mode: "slack_friendly",
    label: "Slack-Friendly",
    description: "Short, scannable summaries designed for quick reading in Slack.",
    requiredPlan: "pro",
    example: {
      summary: "Avatar upload + cropping in profile settings",
      impact: "medium",
      category: "Feature",
      details: "New avatar upload with crop UI. Stored in S3, served via signed URLs.",
    },
  },
  {
    mode: "detailed_engineering",
    label: "Detailed Engineering",
    description: "Technical deep-dives with implementation details for engineers.",
    requiredPlan: "pro",
    example: {
      summary: "Implement multipart avatar upload pipeline with sharp-based cropping and S3 lifecycle policies",
      impact: "medium",
      category: "Feature",
      details: "Adds POST /api/avatar (multipart/form-data, max 5 MB). Server-side crop uses sharp to resize to 256\u00d7256 WebP. Uploads to S3 bucket `pushlog-avatars` with a 90-day lifecycle rule on /tmp prefixes. Signed GET URLs expire after 1 hour. The users table gains a nullable avatar_url column (migration 042). React component uses react-image-crop with a 1:1 aspect lock. Error boundary wraps the crop modal so failures don\u2019t unmount the settings page.",
    },
  },
  {
    mode: "executive_summary",
    label: "Executive Summary",
    description: "Non-technical summaries focused on business value and user outcomes.",
    requiredPlan: "pro",
    example: {
      summary: "Users can now personalize their profile with a custom photo",
      impact: "medium",
      category: "User Experience",
      details: "Team members can upload and crop a profile picture directly from their settings page, making it easier to identify teammates across the platform. The feature stores images securely in the cloud.",
    },
  },
  {
    mode: "incident_aware",
    label: "Incident-Aware",
    description: "Risk-focused analysis highlighting potential production issues and breaking changes.",
    requiredPlan: "team",
    example: {
      summary: "Avatar upload endpoint introduced \u2014 review file-size limits and S3 IAM permissions",
      impact: "high",
      category: "Feature / Risk",
      details: "New multipart upload endpoint accepts user files up to 5 MB. Potential risks: (1) No rate-limiting on the upload route \u2014 could be abused for storage exhaustion. (2) S3 bucket policy grants s3:PutObject to the app role but does not restrict Content-Type \u2014 non-image files could be stored. (3) The sharp image processing step runs synchronously on the request thread; large payloads may spike latency. (4) Migration adds a nullable column, which is safe, but ensure the deploy order is migration-first to avoid 500s from the new code reading a missing column.",
    },
  },
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
  preferredPushlogMode?: string;
}

export default function Models() {
  const [providerTab, setProviderTab] = useState<ModelsTab>(getStoredModelsTab);
  const [applyToIntegrationId, setApplyToIntegrationId] = useState<string>("");
  const [replaceAllConfirmOpen, setReplaceAllConfirmOpen] = useState(false);
  const [replaceAllModelId, setReplaceAllModelId] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<PushlogMode>("clean_summary");
  const [previewMode, setPreviewMode] = useState<ModeCard | null>(null);
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

  // Sync selectedMode from profile once loaded
  useEffect(() => {
    const saved = (profileResponse?.user as ProfileUser | undefined)?.preferredPushlogMode;
    if (saved && (["clean_summary", "slack_friendly", "detailed_engineering", "executive_summary", "incident_aware"] as string[]).includes(saved)) {
      setSelectedMode(saved as PushlogMode);
    }
  }, [profileResponse]);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
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
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update integrations", description: e.message, variant: "destructive" });
    },
  });

  const setModeMutation = useMutation({
    mutationFn: async (mode: PushlogMode) => {
      const res = await apiRequest("PATCH", "/api/user", { preferredPushlogMode: mode });
      return res.json();
    },
    onSuccess: (_, mode) => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update summary mode", description: e.message, variant: "destructive" });
    },
  });

  const handleModeSelect = (card: ModeCard) => {
    const accessible = isModeAccessible(userPlan, card.requiredPlan);
    if (!accessible) return;
    if (selectedMode === card.mode) {
      setPreviewMode(card);
      return;
    }
    setSelectedMode(card.mode);
    setModeMutation.mutate(card.mode);
  };

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
              const isSaving = setModeMutation.isPending && setModeMutation.variables === card.mode;
              return (
                <button
                  key={card.mode}
                  type="button"
                  disabled={!accessible || isSaving}
                  onClick={() => handleModeSelect(card)}
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
                  {accessible && (
                    <div className="mt-3 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPreviewMode(card); }}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View example
                      </button>
                      {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-log-green" />}
                      {isSelected && !isSaving && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-log-green">
                          <Check className="w-3.5 h-3.5" />
                          Active
                        </span>
                      )}
                    </div>
                  )}
                  {!accessible && (
                    <div className="mt-3">
                      {isPayingUiEnabled() ? (
                        <Link href="/pricing" className="text-xs text-log-green hover:underline">
                          Upgrade to {card.requiredPlan}
                        </Link>
                      ) : (
                        <p className="text-xs text-muted-foreground">This mode requires a higher tier.</p>
                      )}
                    </div>
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

        {/* Mode Example Preview Modal */}
        <Dialog open={!!previewMode} onOpenChange={(open) => { if (!open) setPreviewMode(null); }}>
          <DialogContent className="max-w-lg">
            {previewMode && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-foreground flex items-center gap-2">
                    <Eye className="w-5 h-5 text-log-green" />
                    {previewMode.label} — Example
                  </DialogTitle>
                  <DialogDescription>{previewMode.description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-xs text-muted-foreground">
                    Below is a sample summary for the same commit shown in each mode, so you can compare the style and detail level.
                  </p>
                  <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Summary</p>
                      <p className="text-sm text-foreground">{previewMode.example.summary}</p>
                    </div>
                    <div className="flex gap-4">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Impact</p>
                        <Badge variant="outline" className={`text-xs capitalize ${
                          previewMode.example.impact === "high" ? "border-red-500/50 text-red-400" :
                          previewMode.example.impact === "medium" ? "border-yellow-500/50 text-yellow-400" :
                          "border-green-500/50 text-green-400"
                        }`}>
                          {previewMode.example.impact}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Category</p>
                        <Badge variant="outline" className="text-xs">{previewMode.example.category}</Badge>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Details</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{previewMode.example.details}</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    {selectedMode !== previewMode.mode && isModeAccessible(userPlan, previewMode.requiredPlan) && (
                      <Button
                        className="bg-log-green hover:bg-log-green/90"
                        disabled={setModeMutation.isPending}
                        onClick={() => {
                          setSelectedMode(previewMode.mode);
                          setModeMutation.mutate(previewMode.mode);
                          setPreviewMode(null);
                        }}
                      >
                        {setModeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Use ${previewMode.label}`}
                      </Button>
                    )}
                    {selectedMode === previewMode.mode && (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-log-green px-3 py-2">
                        <Check className="w-4 h-4" />
                        Currently active
                      </span>
                    )}
                    <Button variant="outline" onClick={() => setPreviewMode(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

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
