import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { GitBranch, MessageSquare, AlertCircle, Mail, ExternalLink, UserPlus } from "lucide-react";
import { getAiModelDisplayName, getIncidentSourceLabel } from "@/lib/utils";
import { formatCreatedAt, formatRelativeOrLocal } from "@/lib/date";
import { useNotifications } from "@/hooks/use-notifications";

const MAX_PREVIEW = 120;

function CollapsibleMessage({
  message,
  maxPreviewChars = MAX_PREVIEW,
  mono = false,
  className = "",
}: {
  message: string;
  maxPreviewChars?: number;
  mono?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.length > maxPreviewChars;
  const display = isLong && !expanded ? message.slice(0, maxPreviewChars) + "…" : message;

  return (
    <div className={className}>
      <p
        className={`text-sm text-muted-foreground break-words ${mono ? "font-mono text-xs" : ""}`}
        style={{ wordBreak: "break-word" as const, overflowWrap: "anywhere" }}
      >
        {display}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          {expanded ? (
            <>Show less <ChevronUp className="w-3 h-3" /></>
          ) : (
            <>Show full message <ChevronDown className="w-3 h-3" /></>
          )}
        </button>
      )}
    </div>
  );
}

/** True when `msg` is fully contained within `title` (redundant to show both). */
function messageIsRedundant(title: string, msg: string): boolean {
  if (!title || !msg) return false;
  const t = title.toLowerCase().trim();
  const m = msg.toLowerCase().trim();
  return t === m || t.includes(m) || m.includes(t);
}

export function NotificationDetailsModal() {
  const { notifications, readNotification, removeNotification } = useNotifications();
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handle = (e: CustomEvent<{ id?: string | number; notification?: any }>) => {
      const { id: targetId, notification: directNotif } = e.detail ?? {};
      const notif = directNotif ?? (targetId != null ? notifications.find((n: any) => String(n.id) === String(targetId)) : null);
      if (notif) {
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
        setSelectedNotification(notif);
        setDialogOpen(true);
        readNotification(notif.id);
      }
    };
    window.addEventListener("show-notification-modal", handle as EventListener);
    return () => window.removeEventListener("show-notification-modal", handle as EventListener);
  }, [notifications, readNotification]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDialogOpen(false);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = setTimeout(() => setSelectedNotification(null), 250);
    }
  };

  useEffect(() => () => { if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current); }, []);

  return (
    <>
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <ErrorBoundary fallback={
          <div className="py-4 text-center text-muted-foreground text-sm">
            <p>Couldn't load notification details.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => { setDialogOpen(false); setSelectedNotification(null); }}>
              Close
            </Button>
          </div>
        }>
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {selectedNotification?.type === 'push_event' ? (
              <GitBranch className="w-5 h-5 text-log-green mr-2" />
            ) : selectedNotification?.type === 'slack_message_sent' ? (
              <MessageSquare className="w-5 h-5 text-sky-blue mr-2" />
            ) : selectedNotification?.type === 'member_joined' ? (
              <UserPlus className="w-5 h-5 text-log-green mr-2" />
            ) : selectedNotification?.type === 'slack_delivery_failed' || selectedNotification?.type === 'openrouter_error' || selectedNotification?.type === 'incident_alert' || (selectedNotification as { type?: string })?.type === 'budget_alert' ? (
              <AlertCircle className="w-5 h-5 text-destructive mr-2" />
            ) : (
              <Mail className="w-5 h-5 text-amber-500 mr-2" />
            )}
            Notification Details
          </DialogTitle>
          <DialogDescription className="sr-only">
            {selectedNotification ? `Details for ${selectedNotification.title || selectedNotification.message}` : 'Notification details'}
          </DialogDescription>
        </DialogHeader>
        {selectedNotification && (() => {
          // Parse metadata if it's a string (guard against throw)
          let metadata: any = null;
          try {
            if (selectedNotification.metadata) {
              metadata = typeof selectedNotification.metadata === 'string'
                ? JSON.parse(selectedNotification.metadata)
                : selectedNotification.metadata;
            }
          } catch (e) {
            console.error('Failed to parse notification metadata:', e);
          }

          const notifType = selectedNotification.type ?? '';
          const isPushEvent = notifType === 'push_event';
          const isSlackMessage = notifType === 'slack_message_sent';
          const isSlackDeliveryFailed = notifType === 'slack_delivery_failed';
          const isOpenRouterError = notifType === 'openrouter_error';
          const isIncidentAlert = notifType === 'incident_alert';
          const commitUrl = metadata?.repositoryFullName && metadata?.commitSha
            ? `https://github.com/${metadata.repositoryFullName}/commit/${metadata.commitSha}`
            : null;

          const title = selectedNotification.title ?? "";
          const msg = selectedNotification.message ?? "";
          const showMessage = msg && !messageIsRedundant(title, msg);

          return (
            <div className="space-y-4 min-w-0 break-words">
              <div className="break-words">
                <h3 className="font-medium text-foreground text-base break-words">
                  {title || msg}
                </h3>
                {showMessage && (
                  <CollapsibleMessage
                    message={msg}
                    mono={isIncidentAlert}
                    className="mt-1"
                  />
                )}
              </div>

              {/* Push Event Details — layout matches Notification Details spec */}
              {isPushEvent && metadata && (
                <div className="border-t border-border pt-4 space-y-4">
                  <h4 className="font-semibold text-foreground text-sm">Push Event Details</h4>
                  
                  {metadata.repositoryFullName && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Repository:</span>{' '}
                      <span className="text-muted-foreground">{metadata.repositoryFullName}</span>
                    </div>
                  )}
                  
                  {metadata.branch && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Branch:</span>{' '}
                      <span className="text-muted-foreground">{metadata.branch}</span>
                    </div>
                  )}
                  
                  {metadata.author && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Author:</span>{' '}
                      <span className="text-muted-foreground">{metadata.author}</span>
                    </div>
                  )}
                  
                  {metadata.commitMessage && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Commit Message:</span>
                      <p className="text-muted-foreground mt-2 pl-4 border-l-2 border-border whitespace-pre-wrap">
                        {metadata.commitMessage}
                      </p>
                    </div>
                  )}
                  
                  {(metadata.additions !== undefined || metadata.deletions !== undefined) && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Changes:</span>{' '}
                      <span className="text-green-600">+{metadata.additions ?? 0}</span>{' '}
                      <span className="text-red-600">-{metadata.deletions ?? 0}</span>
                      {metadata.filesChanged !== undefined && (
                        <span className="text-muted-foreground"> ({metadata.filesChanged} files)</span>
                      )}
                    </div>
                  )}
                  
                  {commitUrl && (
                    <div className="text-sm">
                      <a
                        href={commitUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-blue hover:underline inline-flex items-center gap-1"
                      >
                        <GitBranch className="w-4 h-4" />
                        View Commit on GitHub
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* AI Summary — Model breakdown, Summary, Impact, Category */}
                  {metadata.aiGenerated && (
                    <div className="pt-4 border-t border-border space-y-3">
                      <h5 className="font-semibold text-foreground text-sm">AI Summary</h5>
                      {metadata.aiModel && (
                        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                          <div className="text-sm">
                            <span className="font-medium text-foreground">Model:</span>{' '}
                            <span className="text-muted-foreground">{getAiModelDisplayName(metadata.aiModel)}</span>
                          </div>
                          {String(metadata.aiModel).includes('/') ? (
                            <>
                              <div className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground/80">Provider:</span>{' '}
                                {String(metadata.aiModel).split('/')[0]}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">
                                <span className="font-medium text-foreground/80">ID:</span>{' '}
                                {metadata.aiModel}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground/80">Source:</span>{' '}
                                <span className="text-log-green">OpenRouter</span>
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">Source:</span>{' '}
                              <span className="text-log-green">PushLog AI</span>
                            </div>
                          )}
                        </div>
                      )}
                      {metadata.aiSummary && (
                        <div className="text-sm">
                          <span className="font-medium text-foreground">Summary:</span>
                          <p className="text-muted-foreground mt-2">{metadata.aiSummary}</p>
                        </div>
                      )}
                      {metadata.aiImpact && (
                        <div className="text-sm">
                          <span className="font-medium text-foreground">Impact:</span>{' '}
                          <span className={`font-medium ${
                            metadata.aiImpact === 'high' ? 'text-red-600' :
                            metadata.aiImpact === 'medium' ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {String(metadata.aiImpact ?? '').toUpperCase()}
                          </span>
                        </div>
                      )}
                      {metadata.aiCategory != null && String(metadata.aiCategory) && (
                        <div className="text-sm">
                          <span className="font-medium text-foreground">Category:</span>{' '}
                          <span className="text-muted-foreground capitalize">{String(metadata.aiCategory)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Slack delivery failed */}
              {isSlackDeliveryFailed && metadata && (
                <div className="border-t border-border pt-4 space-y-3">
                  <h4 className="font-semibold text-destructive text-sm">Slack delivery failed</h4>
                  {metadata.slackChannelName && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Channel:</span>{' '}
                      <span className="text-muted-foreground">#{metadata.slackChannelName}</span>
                    </div>
                  )}
                  {metadata.repositoryName && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Repository:</span>{' '}
                      <span className="text-muted-foreground">{metadata.repositoryName}</span>
                    </div>
                  )}
                  {metadata.error && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Error:</span>
                      <p className="text-muted-foreground mt-1 pl-4 border-l-2 border-destructive/50">{metadata.error}</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Reconnect Slack from Integrations and invite the app to the channel (/invite @PushLog) if needed.
                  </p>
                </div>
              )}

              {/* OpenRouter error */}
              {isOpenRouterError && (
                <div className="border-t border-border pt-4 space-y-3">
                  <h4 className="font-semibold text-destructive text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    OpenRouter error
                  </h4>
                  {metadata?.repositoryName && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Repository:</span>{' '}
                      <span className="text-muted-foreground">{metadata.repositoryName}</span>
                    </div>
                  )}
                  {metadata?.slackChannelName && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Channel:</span>{' '}
                      <span className="text-muted-foreground">#{metadata.slackChannelName}</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Fix rate limits or data policy at{' '}
                    <a href="https://openrouter.ai/settings" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      openrouter.ai/settings
                    </a>
                    , or try a different model in Integration Settings.
                  </p>
                </div>
              )}

              {/* Incident alert — detailed view from Rust incident engine (error shown once at top) */}
              {isIncidentAlert && (
                <div className="border-t border-border pt-4 space-y-4 break-words">
                  <h4 className="font-semibold text-destructive text-sm flex items-center gap-2 flex-wrap">
                    <AlertCircle className="w-4 h-4" />
                    Incident details
                    {getIncidentSourceLabel(metadata) && (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                        {getIncidentSourceLabel(metadata)}
                      </span>
                    )}
                  </h4>

                  {/* API route and file:line — shown when available (Sentry webhook) */}
                  {(metadata?.apiRoute || metadata?.culprit || metadata?.culpritSource) && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 text-sm">
                      <h5 className="font-semibold text-foreground text-xs uppercase tracking-wide">Location</h5>
                      {metadata?.apiRoute && (
                        <div>
                          <span className="font-medium text-foreground">Route:</span>{' '}
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                            {metadata.apiRoute}
                          </code>
                        </div>
                      )}
                      {(metadata?.culpritSource || metadata?.culprit) && (
                        <div>
                          <span className="font-medium text-foreground">Stack frame:</span>{' '}
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono break-words">
                            {metadata.culpritSource ?? metadata.culprit}
                          </code>
                          {metadata.culprit && !metadata.culpritSource && (
                            <p className="text-xs text-muted-foreground mt-1">Bundled build — upload source maps to Sentry to see original source.</p>
                          )}
                        </div>
                      )}
                      {metadata?.requestUrl && (
                        <div className="text-xs text-muted-foreground break-words" title={metadata.requestUrl}>
                          {metadata.requestUrl}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm break-words">
                    <h5 className="font-semibold text-foreground text-xs uppercase tracking-wide">Summary</h5>
                    <div className="grid gap-1.5">
                      {metadata?.incidentId && (
                        <div><span className="font-medium text-foreground">Incident ID:</span>{' '}
                          <code className="text-xs bg-muted px-1 rounded">{metadata.incidentId}</code>
                        </div>
                      )}
                      {metadata?.service && (
                        <div><span className="font-medium text-foreground">Service:</span>{' '}
                          <span className="text-muted-foreground">{metadata.service}</span></div>
                      )}
                      {metadata?.environment && (
                        <div><span className="font-medium text-foreground">Environment:</span>{' '}
                          <span className="text-muted-foreground">{metadata.environment}</span></div>
                      )}
                      {metadata?.trigger && (
                        <div><span className="font-medium text-foreground">Trigger:</span>{' '}
                          <span className="text-muted-foreground capitalize">{String(metadata.trigger).replace(/_/g, ' ')}</span></div>
                      )}
                      {metadata?.severity && (
                        <div><span className="font-medium text-foreground">Severity:</span>{' '}
                          <span className="text-muted-foreground capitalize">{metadata.severity}</span></div>
                      )}
                      {metadata?.priorityScore != null && (
                        <div><span className="font-medium text-foreground">Priority score:</span>{' '}
                          <span className="text-muted-foreground">{metadata.priorityScore}</span></div>
                      )}
                      {metadata?.startTime && (
                        <div><span className="font-medium text-foreground">First seen:</span>{' '}
                          <span className="text-muted-foreground">{new Date(metadata.startTime).toLocaleString()}</span></div>
                      )}
                      {metadata?.lastSeen && (
                        <div><span className="font-medium text-foreground">Last seen:</span>{' '}
                          <span className="text-muted-foreground">{new Date(metadata.lastSeen).toLocaleString()}</span></div>
                      )}
                      {metadata?.peakTime && (
                        <div><span className="font-medium text-foreground">Peak time:</span>{' '}
                          <span className="text-muted-foreground">{metadata.peakTime}</span></div>
                      )}
                    </div>
                  </div>

                  {Array.isArray(metadata?.topSymptoms) && metadata.topSymptoms.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 break-words">
                      <h5 className="font-semibold text-foreground text-xs uppercase tracking-wide">Top symptoms</h5>
                      {metadata.topSymptoms.map((s: { exception_type?: string; message?: string; count?: number; spike_factor?: number; fingerprint?: string }, i: number) => (
                        <div key={s.fingerprint ?? `symptom-${i}`} className="text-sm pl-3 border-l-2 border-destructive/50 space-y-1 break-words">
                          <div><span className="font-medium text-foreground">Type:</span> {s.exception_type}</div>
                          {s.message && (
                            <div className="min-w-0 w-full">
                              <span className="font-medium text-foreground">Message:</span>
                              <CollapsibleMessage
                                message={s.message}
                                mono
                                className="mt-0.5"
                              />
                            </div>
                          )}
                          {s.count != null && <div><span className="font-medium text-foreground">Count:</span> {s.count}</div>}
                          {s.spike_factor != null && <div><span className="font-medium text-foreground">Spike factor:</span> {s.spike_factor}</div>}
                          {s.fingerprint && <div className="text-xs font-mono text-muted-foreground break-words" title={s.fingerprint}>Fingerprint: {s.fingerprint}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(metadata?.suspectedCauses) && metadata.suspectedCauses.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                      <h5 className="font-semibold text-foreground text-xs uppercase tracking-wide">Suspected causes</h5>
                      {metadata.suspectedCauses.map((c: { commit_id?: string; score?: number; evidence?: string[] }, i: number) => (
                        <div key={c.commit_id ?? `cause-${i}`} className="text-sm pl-3 border-l-2 border-amber-500/50 space-y-1">
                          <div><span className="font-medium text-foreground">Commit:</span> <code className="text-xs bg-muted px-1 rounded">{c.commit_id}</code></div>
                          {c.score != null && <div><span className="font-medium text-foreground">Score:</span> {c.score}</div>}
                          {Array.isArray(c.evidence) && c.evidence.length > 0 && (
                            <ul className="list-disc list-inside text-muted-foreground text-xs">
                              {c.evidence.map((e: string, j: number) => <li key={`${e}-${j}`}>{e}</li>)}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(metadata?.relatedCommits) && metadata.relatedCommits.length > 0 && (
                    <div className="rounded-lg border border-log-green/30 bg-log-green/5 p-3 space-y-2">
                      <h5 className="font-semibold text-foreground text-xs uppercase tracking-wide">Correlated commits</h5>
                      {metadata.correlatedFile && (
                        <p className="text-xs text-muted-foreground">
                          {metadata.correlatedLine != null
                            ? "Commits that added a line at "
                            : "Commits touching "}
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                            {metadata.correlatedFile}{metadata.correlatedLine ? `:${metadata.correlatedLine}` : ""}
                          </code>
                          {metadata.correlatedLine != null ? " in this file" : ""}
                        </p>
                      )}
                      <div className="space-y-2">
                        {metadata.relatedCommits.map((c: { sha?: string; shortSha?: string; message?: string; author?: { login?: string; name?: string | null }; htmlUrl?: string; timestamp?: string; touchesErrorLine?: boolean; lineDistance?: number; score?: number }, i: number) => (
                          <div key={c.sha ?? c.shortSha ?? `commit-${i}`} className={`text-sm pl-3 space-y-1 ${c.touchesErrorLine ? "border-l-2 border-red-500/70" : "border-l-2 border-log-green/50"}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={c.htmlUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs text-sky-blue hover:underline"
                              >
                                {c.shortSha ?? c.sha?.slice(0, 7) ?? "—"}
                              </a>
                              <span className="text-foreground text-sm">{c.message ?? ""}</span>
                              {c.touchesErrorLine && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-500 border border-red-500/30">
                                  added this line
                                </span>
                              )}
                              {!c.touchesErrorLine && c.lineDistance != null && c.lineDistance <= 30 && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/30">
                                  {c.lineDistance} lines away
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {c.author?.login && <span>@{c.author.login}</span>}
                              {c.author?.login && c.timestamp && <span className="text-border">·</span>}
                              {c.timestamp && <span>{formatRelativeOrLocal(c.timestamp)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {Array.isArray(metadata?.relevantAuthors) && metadata.relevantAuthors.length >= 2 && (
                        <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                          Potentially relevant authors: {metadata.relevantAuthors.map((a: { login?: string }) => a.login).filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                  )}

                  {Array.isArray(metadata?.recommendedFirstActions) && metadata.recommendedFirstActions.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 break-words">
                      <h5 className="font-semibold text-foreground text-xs uppercase tracking-wide">Recommended actions</h5>
                      <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                        {metadata.recommendedFirstActions.map((a: string, i: number) => <li key={`${a}-${i}`}>{a}</li>)}
                      </ol>
                    </div>
                  )}

                  {Array.isArray(metadata?.stacktrace) && metadata.stacktrace.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 break-words">
                      {metadata.stackTraceIsBundled && (
                        <p className="text-xs text-amber-600 dark:text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                          This stack trace is from your bundled/minified build. Upload source maps to Sentry (Project → Settings → Source Maps) so Sentry can show original file names and lines. Then re-deploy with a matching release.
                        </p>
                      )}
                      {(metadata?.stacktrace?.length === 1 && metadata.stacktrace[0]?.file === "log") && (
                        <p className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md px-3 py-2">
                          Captured from log output (no stack trace in log line). The error message above contains the full context.
                        </p>
                      )}
                      <h5 className="font-semibold text-foreground text-xs uppercase tracking-wide">Stack trace</h5>
                      <div className="font-mono text-xs space-y-1 max-h-32 overflow-y-auto break-words">
                        {metadata.stacktrace
                          .filter((f: { file?: string }) => {
                            const file = f.file ?? "";
                            return file && !/^log$/i.test(file) && !/^test$/i.test(file) && !/^\d{1,2}\/\w{3}\/\d{4}/.test(file) && !/^\d{4}-\d{2}-\d{2}/.test(file);
                          })
                          .map((f: { file?: string; function?: string; line?: number }, i: number) => (
                          <div key={`${f.file}-${i}`} className="pl-3 border-l-2 border-amber-500/30 break-words" title={`${f.file}${f.function ? ` in ${f.function}` : ''}`}>
                            <span className="text-muted-foreground">at</span> {f.file}
                            {f.line != null && <span className="text-amber-600 dark:text-amber-500">:{f.line}</span>}
                            {f.function ? ` (${f.function})` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {metadata?.links?.source_url && (
                    <div className="text-sm">
                      <a
                        href={metadata.links.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-blue hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View in Sentry
                      </a>
                    </div>
                  )}
                  {metadata?.links?.pushlog_user_id && (
                    <p className="text-xs text-muted-foreground">Target user: {metadata.links.pushlog_user_id}</p>
                  )}
                </div>
              )}

              {/* Slack Message Details */}
              {isSlackMessage && metadata && (
                <div className="border-t border-border pt-4 space-y-3">
                  <h4 className="font-semibold text-foreground text-sm">Slack Message Details</h4>
                  
                  {metadata.slackChannelName && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Channel:</span>{' '}
                      <span className="text-muted-foreground">#{metadata.slackChannelName}</span>
                    </div>
                  )}
                  
                  {metadata.repositoryFullName && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Repository:</span>{' '}
                      <span className="text-muted-foreground">{metadata.repositoryFullName}</span>
                    </div>
                  )}
                  
                  {metadata.branch && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Branch:</span>{' '}
                      <span className="text-muted-foreground">{metadata.branch}</span>
                    </div>
                  )}
                  
                  {metadata.commitMessage && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Commit:</span>
                      <p className="text-muted-foreground mt-1 pl-4 border-l-2 border-border">
                        {metadata.commitMessage}
                      </p>
                    </div>
                  )}
                  
                  {commitUrl && (
                    <div className="text-sm">
                      <a 
                        href={commitUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sky-blue hover:underline flex items-center gap-1"
                      >
                        <GitBranch className="w-4 h-4" />
                        View Commit on GitHub
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* AI Model Used — breakdown card */}
                  {metadata.aiModel && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      <h5 className="font-semibold text-foreground text-sm">AI Model</h5>
                      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                        <div className="text-sm">
                          <span className="font-medium text-foreground">Model:</span>{' '}
                          <span className="text-muted-foreground">{getAiModelDisplayName(metadata.aiModel)}</span>
                        </div>
                        {String(metadata.aiModel).includes('/') ? (
                          <>
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">Provider:</span>{' '}
                              {String(metadata.aiModel).split('/')[0]}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              <span className="font-medium text-foreground/80">ID:</span>{' '}
                              {metadata.aiModel}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">Source:</span>{' '}
                              <span className="text-log-green">OpenRouter</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/80">Source:</span>{' '}
                            <span className="text-log-green">PushLog AI</span>
                          </div>
                        )}
                      </div>
                      {metadata.aiGenerated === false && (
                        <p className="text-xs text-muted-foreground">
                          AI summary was not generated (fallback message used)
                        </p>
                      )}
                    </div>
                  )}

                  {/* AI Summary if available */}
                  {metadata.aiGenerated && metadata.aiSummary && (
                    <div className="mt-4 pt-4 border-t border-border space-y-2">
                      <h5 className="font-semibold text-foreground text-sm">AI Summary</h5>
                      <p className="text-sm text-muted-foreground">{metadata.aiSummary}</p>
                      {metadata.aiImpact && (
                        <div className="text-sm">
                          <span className="font-medium text-foreground">Impact:</span>{' '}
                          <span className={`font-medium ${
                            metadata.aiImpact === 'high' ? 'text-red-600' :
                            metadata.aiImpact === 'medium' ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {String(metadata.aiImpact ?? '').toUpperCase()}
                          </span>
                        </div>
                      )}
                      {metadata.aiCategory != null && String(metadata.aiCategory) && (
                        <div className="text-sm">
                          <span className="font-medium text-foreground">Category:</span>{' '}
                          <span className="text-muted-foreground capitalize">{String(metadata.aiCategory)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Basic info: Type, Created, Push Event ID */}
              <div className="border-t border-border pt-4 text-sm text-muted-foreground space-y-1">
                <p><strong className="text-foreground">Type:</strong> {(selectedNotification.type ?? '').replace(/_/g, ' ')}</p>
                <p><strong className="text-foreground">Created:</strong> {formatCreatedAt((selectedNotification as any).createdAt ?? (selectedNotification as any).created_at)}</p>
                {metadata?.pushEventId != null && (
                  <p><strong className="text-foreground">Push Event ID:</strong> {metadata.pushEventId}</p>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Close
                </Button>
                {(selectedNotification.type ?? '') !== 'email_verification' && (
                  <Button
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                      closeTimeoutRef.current = null;
                      removeNotification(selectedNotification.id);
                      setDialogOpen(false);
                      setSelectedNotification(null);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })()}
        </ErrorBoundary>
      </DialogContent>
    </Dialog>
    </>
  );
}