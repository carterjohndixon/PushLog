import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, Mail, MessageSquare, GitBranch, X, Eye, ExternalLink, AlertCircle } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { getAiModelDisplayName } from "@/lib/utils";
import { formatRelativeOrLocal, formatCreatedAt } from "@/lib/date";
import { ErrorBoundary } from "@/components/error-boundary";
import { useState } from "react";

interface NotificationsDropdownProps {
  isEmailVerified: boolean;
}

export function NotificationsDropdown({ isEmailVerified }: NotificationsDropdownProps) {
  const { notifications, count, hasUnread, markAllAsRead, removeNotification, readNotification, clearAllNotifications, refetchNotifications } = useNotifications();
  const [selectedNotification, setSelectedNotification] = useState<any>(null);

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open) refetchNotifications(); }}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
        >
          <Bell className="text-muted-foreground hover:text-foreground transition-colors" />
          {hasUnread && (
            <span className={`absolute -top-1 -right-1 bg-log-green text-white text-xs rounded-full flex items-center justify-center ${
              count >= 10 ? 'w-5 h-5 px-1' : 'w-4 h-4'
            }`}>
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[50vh] flex flex-col">
        <div className="flex-1 overflow-y-auto">
          {notifications.map((notification) => (
          <div 
            key={notification.id} 
            className={`flex items-center justify-between gap-2 p-4 min-w-0 [&:hover]:!bg-muted ${
              notification.type === 'email_verification' ? 'bg-amber-500/10 dark:bg-amber-500/20 border-b border-border' : 
              (notification.type === 'openrouter_error' || notification.type === 'slack_delivery_failed' || (notification as { type: string }).type === 'budget_alert') ? 'bg-destructive/10 border-l-4 border-destructive' :
              !notification.isRead ? 'bg-primary/10 border-l-4 border-primary' : ''
            }`}
          >
            <div className="flex items-center flex-1 min-w-0 overflow-hidden">
              {notification.type === 'push_event' ? (
                <GitBranch className="w-5 h-5 text-log-green mr-3 flex-shrink-0" />
              ) : notification.type === 'slack_message_sent' ? (
                <MessageSquare className="w-5 h-5 text-sky-blue mr-3 flex-shrink-0" />
              ) : notification.type === 'slack_delivery_failed' || notification.type === 'openrouter_error' || (notification as { type: string }).type === 'budget_alert' ? (
                <AlertCircle className="w-5 h-5 text-destructive mr-3 flex-shrink-0" />
              ) : (
                <Mail className={`w-5 h-5 mr-3 flex-shrink-0 ${
                  notification.type === 'email_verification' ? 'text-amber-500' : 'text-steel-gray'
                }`} />
              )}
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                <span className={`text-sm font-medium truncate ${
                  notification.type === 'email_verification' ? 'text-amber-600 dark:text-amber-400' : 
                  notification.type === 'push_event' ? 'text-log-green' :
                  notification.type === 'slack_message_sent' ? 'text-sky-blue' :
                  notification.type === 'slack_delivery_failed' || notification.type === 'openrouter_error' || (notification as { type: string }).type === 'budget_alert' ? 'text-destructive' : 'text-foreground'
                }`}>
                  {(notification as { type: string }).type === 'budget_alert' ? 'Urgent: ' + (notification.title || notification.message) : (notification.title || notification.message)}
                </span>
                <span className="text-xs text-muted-foreground line-clamp-2 break-words">
                  {notification.message}
                </span>
                <span className="text-xs text-muted-foreground/80">
                  {formatRelativeOrLocal(notification.createdAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNotification(notification);
                  readNotification(notification.id);
                }}
                title="View details"
              >
                <Eye className="w-3 h-3 text-muted-foreground" />
              </Button>
              {notification.type !== 'email_verification' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeNotification(notification.id);
                  }}
                  title="Remove notification"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {(notifications.length === 0) && (
          <div className="p-4 text-center text-muted-foreground">
            No new notifications
          </div>
        )}
        </div>
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="p-2 flex justify-between items-center bg-muted/50 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  markAllAsRead();
                }}
              >
                Mark all as read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive/90"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAllNotifications();
                }}
              >
                Clear all
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    {/* Notification Details Dialog */}
    <Dialog open={!!selectedNotification} onOpenChange={(open) => !open && setSelectedNotification(null)}>
      <DialogContent className="sm:max-w-md max-h-[70vh] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <ErrorBoundary fallback={
          <div className="py-4 text-center text-muted-foreground text-sm">
            <p>Couldn’t load notification details.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setSelectedNotification(null)}>
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
            ) : selectedNotification?.type === 'slack_delivery_failed' || selectedNotification?.type === 'openrouter_error' || (selectedNotification as { type?: string })?.type === 'budget_alert' ? (
              <AlertCircle className="w-5 h-5 text-destructive mr-2" />
            ) : (
              <Mail className="w-5 h-5 text-amber-500 mr-2" />
            )}
            Notification Details
          </DialogTitle>
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
          const commitUrl = metadata?.repositoryFullName && metadata?.commitSha
            ? `https://github.com/${metadata.repositoryFullName}/commit/${metadata.commitSha}`
            : null;

          return (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-foreground text-base">
                  {selectedNotification.title || selectedNotification.message}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedNotification.message}
                </p>
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
                  <p className="text-sm text-muted-foreground">
                    {selectedNotification.message}
                  </p>
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
                  onClick={() => setSelectedNotification(null)}
                >
                  Close
                </Button>
                {(selectedNotification.type ?? '') !== 'email_verification' && (
                  <Button
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNotification(selectedNotification.id);
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