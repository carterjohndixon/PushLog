import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExactLineMatchTestResponse } from "@/lib/exactLineMatchUi";

type Props = {
  /** When set, server loads stack/service/startTime from that incident notification. */
  incidentId?: string;
  className?: string;
};

/**
 * Local debug control for POST /api/debug/test-exact-line-match. Not shown on production hosts (parent decides).
 */
export function ExactLineMatchTestRunner({ incidentId, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExactLineMatchTestResponse | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/debug/test-exact-line-match", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          mode: "exact_line_match",
          ...(incidentId ? { incidentId } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({
        ok: false,
        error: "Response was not valid JSON",
      }))) as ExactLineMatchTestResponse;
      setData(json);
      if (!res.ok || json.ok === false) {
        setError(json.error || json.hint || json.detail || `HTTP ${res.status}`);
      }
    } catch {
      setError("Network or server error.");
    } finally {
      setLoading(false);
    }
  };

  const ok = data?.ok === true;
  const strong = ok && data?.exactLineMatch?.matched;

  return (
    <div className={className}>
      <p className="text-[11px] text-muted-foreground leading-snug mb-2">
        <span className="font-medium text-amber-700/90 dark:text-amber-500/90">[Debug]</span> Staging/dev only.         Re-runs GitHub correlation
        {incidentId ? " for this incident's stored stack" : " (fallback stack if no incidentId)"}.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        className="border-emerald-500/35 text-emerald-800 dark:text-emerald-400 text-xs h-8"
        onClick={run}
      >
        {loading ? "Running test…" : "[Debug] Exact line match test"}
      </Button>

      {data && error && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}
      {data && !error && !ok && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-muted-foreground">
          Request completed with ok: false. See JSON below.
        </div>
      )}

      {data && ok && (
        <div className="mt-3 rounded-md border border-border bg-muted/20 p-2 space-y-2 text-xs">
          <div className="font-medium text-foreground">Result</div>
          <div className="text-muted-foreground space-y-1">
            <div>
              <span className="text-foreground/80">Status:</span>{" "}
              <span className={strong ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>
                {strong ? "Exact line match" : "No exact line match (or skipped)"}
              </span>
            </div>
            {strong && (
              <p className="text-[11px] italic border-l-2 border-emerald-500/40 pl-2">
                High-confidence correlation — recent commit added the same source line text (normalized).
              </p>
            )}
            <div>
              <span className="text-foreground/80">Resolved source line:</span>{" "}
              {data.resolvedSourceLine != null && String(data.resolvedSourceLine).length > 0 ? (
                <code className="block mt-0.5 font-mono text-[11px] bg-muted/80 px-1.5 py-1 rounded max-h-20 overflow-auto break-all whitespace-pre-wrap">
                  {String(data.resolvedSourceLine).trim()}
                </code>
              ) : (
                <span className="italic">(not fetched or empty)</span>
              )}
            </div>
            <div>
              <span className="text-foreground/80">Matched commit SHA(s):</span>{" "}
              {data.debug?.matchedCommitShas && data.debug.matchedCommitShas.length > 0 ? (
                <code className="font-mono text-[11px]">{data.debug.matchedCommitShas.join(", ")}</code>
              ) : (
                <span className="italic">none</span>
              )}
            </div>
            <div>
              <span className="text-foreground/80">Commits diff-checked:</span> {data.debug?.checkedCommitCount ?? 0}
            </div>
            {data.exactLineMatch && (
              <div className="pt-1 border-t border-border/80">
                <span className="text-foreground/80">metadata.exactLineMatch</span>
                <pre className="mt-1 font-mono text-[10px] bg-muted/60 p-1.5 rounded overflow-x-auto max-h-28 overflow-y-auto">
                  {JSON.stringify(data.exactLineMatch, null, 2)}
                </pre>
              </div>
            )}
            {data.debug?.exactNormalizedEvidence && data.debug.exactNormalizedEvidence.length > 0 && (
              <div className="pt-1 border-t border-border/80">
                <span className="text-foreground/80">Exact-match evidence</span>
                <pre className="mt-1 font-mono text-[10px] bg-muted/60 p-1.5 rounded overflow-x-auto max-h-36 overflow-y-auto">
                  {JSON.stringify(data.debug.exactNormalizedEvidence, null, 2)}
                </pre>
              </div>
            )}
          </div>
          {data.hint && <p className="text-[10px] text-muted-foreground pt-1">{data.hint}</p>}
        </div>
      )}

      {data && (
        <div className="mt-2">
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setJsonOpen((o) => !o)}
          >
            {jsonOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Full JSON response
          </button>
          {jsonOpen && (
            <pre className="mt-1 font-mono text-[10px] bg-muted/70 p-2 rounded max-h-52 overflow-auto border border-border">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
