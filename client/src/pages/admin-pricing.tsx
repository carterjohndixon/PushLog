import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { ArrowLeft, Pencil, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

type PricingRow = {
  id: string;
  provider: string;
  modelId: string;
  inputUsdPer1M: string;
  outputUsdPer1M: string;
  updatedAt: string | null;
};

export default function AdminPricingPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<PricingRow | null>(null);
  const [editInput, setEditInput] = useState("");
  const [editOutput, setEditOutput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addModelId, setAddModelId] = useState("");
  const [addInput, setAddInput] = useState("");
  const [addOutput, setAddOutput] = useState("");

  const { data, isLoading, error } = useQuery<{ pricing: PricingRow[] }>({
    queryKey: ["/api/admin/pricing"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pricing", { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to load pricing");
      }
      return res.json();
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: { provider: string; modelId: string; inputUsdPer1M: number; outputUsdPer1M: number; _isNew?: boolean }) => {
      const { _isNew, ...body } = payload;
      const res = await fetch("/api/admin/pricing", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      setEditing(null);
      setAddOpen(false);
      setAddModelId("");
      setAddInput("");
      setAddOutput("");
      toast({ title: "Saved", description: variables?._isNew ? "Pricing added." : "Pricing updated." });
    },
    onError: (e: Error) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const openEdit = (row: PricingRow) => {
    setEditing(row);
    setEditInput(row.inputUsdPer1M);
    setEditOutput(row.outputUsdPer1M);
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    const input = Number(editInput);
    const output = Number(editOutput);
    if (Number.isNaN(input) || Number.isNaN(output)) {
      toast({ title: "Invalid numbers", variant: "destructive" });
      return;
    }
    upsertMutation.mutate({
      provider: editing.provider,
      modelId: editing.modelId,
      inputUsdPer1M: input,
      outputUsdPer1M: output,
    });
  };

  const handleAdd = () => {
    const modelId = addModelId.trim();
    const input = Number(addInput);
    const output = Number(addOutput);
    if (!modelId) {
      toast({ title: "Model ID required", variant: "destructive" });
      return;
    }
    if (Number.isNaN(input) || Number.isNaN(output)) {
      toast({ title: "Enter valid input/output USD per 1M", variant: "destructive" });
      return;
    }
    upsertMutation.mutate({
      provider: "openai",
      modelId,
      inputUsdPer1M: input,
      outputUsdPer1M: output,
      _isNew: true,
    });
  };

  return (
    <div className="min-h-screen bg-forest-gradient">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Admin
            </Button>
          </Link>
        </div>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
            <div>
              <CardTitle>AI Model Pricing</CardTitle>
              <CardDescription>
                Per-1M-token rates (USD) used to compute cost for each generation. Add or edit rows; new generations use the current rates.
              </CardDescription>
            </div>
            <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Add pricing
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </p>
            ) : error ? (
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Failed to load pricing"}
              </p>
            ) : !data?.pricing?.length ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No pricing rows yet. Add your first model to get started.
                </p>
                <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add pricing
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-foreground">Provider</TableHead>
                    <TableHead className="text-foreground">Model ID</TableHead>
                    <TableHead className="text-foreground">Input $/1M</TableHead>
                    <TableHead className="text-foreground">Output $/1M</TableHead>
                    <TableHead className="text-foreground">Updated</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pricing.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.provider}</TableCell>
                      <TableCell className="font-mono text-sm">{row.modelId}</TableCell>
                      <TableCell>{row.inputUsdPer1M}</TableCell>
                      <TableCell>{row.outputUsdPer1M}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell>
                        {row.provider === "openai" ? (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">From API</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit pricing</DialogTitle>
          </DialogHeader>
          {editing && editing.provider !== "openai" ? (
            <p className="text-sm text-muted-foreground">OpenRouter pricing is from the API; edit there.</p>
          ) : editing && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {editing.provider} / {editing.modelId}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Input USD per 1M tokens</label>
                  <Input
                    type="number"
                    step="any"
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Output USD per 1M tokens</label>
                  <Input
                    type="number"
                    step="any"
                    value={editOutput}
                    onChange={(e) => setEditOutput(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            {editing?.provider === "openai" && (
              <Button onClick={handleSaveEdit} disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={(open) => !open && setAddOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add pricing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Add OpenAI model pricing (from <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noopener noreferrer" className="underline">OpenAI Pricing</a>).</p>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Model ID</label>
              <Input
                placeholder="e.g. gpt-5.2, gpt-4o, gpt-4o-mini"
                value={addModelId}
                onChange={(e) => setAddModelId(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use the exact API model id; prefix match is used for variants.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Input USD per 1M tokens</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="2.5"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Output USD per 1M tokens</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="10"
                  value={addOutput}
                  onChange={(e) => setAddOutput(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Adding…
                </>
              ) : (
                "Add"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
