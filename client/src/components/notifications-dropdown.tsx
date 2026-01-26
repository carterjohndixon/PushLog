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
import { Bell, Mail, MessageSquare, GitBranch, X, Eye, ExternalLink } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { useState } from "react";

// Helper function to format notification dates
function formatNotificationDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) {
    return 'Just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (diffInMinutes < 1440) { // Less than 24 hours
    const hours = Math.floor(diffInMinutes / 60);
    return `${hours}h ago`;
  } else {
    return date.toLocaleDateString();
  }
}

interface NotificationsDropdownProps {
  isEmailVerified: boolean;
}

export function NotificationsDropdown({ isEmailVerified }: NotificationsDropdownProps) {
  const { notifications, count, hasUnread, markAllAsRead, removeNotification, readNotification, clearAllNotifications } = useNotifications();
  const [selectedNotification, setSelectedNotification] = useState<any>(null);

  return (
    <>
      <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative hover:bg-gray-100 focus:bg-gray-100 active:bg-gray-100 focus-visible:ring-0 focus:ring-0"
        >
          <Bell className="text-steel-gray hover:text-graphite transition-colors" />
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
            className={`flex items-center justify-between p-4 [&:hover]:!bg-gray-50 ${
              notification.type === 'email_verification' ? 'bg-amber-50 border-b' : 
              !notification.isRead ? 'bg-green-50 border-l-4 border-green-300' : 'bg-white'
            }`}
          >
            <div className="flex items-center flex-1">
              {notification.type === 'push_event' ? (
                <GitBranch className="w-5 h-5 text-log-green mr-3 flex-shrink-0" />
              ) : notification.type === 'slack_message_sent' ? (
                <MessageSquare className="w-5 h-5 text-sky-blue mr-3 flex-shrink-0" />
              ) : (
                <Mail className={`w-5 h-5 mr-3 flex-shrink-0 ${
                  notification.type === 'email_verification' ? 'text-amber-500' : 'text-steel-gray'
                }`} />
              )}
              <div className="flex flex-col flex-1">
                <span className={`text-sm font-medium ${
                  notification.type === 'email_verification' ? 'text-amber-700' : 
                  notification.type === 'push_event' ? 'text-log-green' :
                  notification.type === 'slack_message_sent' ? 'text-sky-blue' : 'text-steel-gray'
                }`}>
                  {notification.title || notification.message}
                </span>
                <span className="text-xs text-gray-500">
                  {notification.message}
                </span>
                <span className="text-xs text-gray-400">
                  {formatNotificationDate(notification.createdAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-1 ml-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-gray-200"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNotification(notification);
                  readNotification(notification.id);
                }}
                title="View details"
              >
                <Eye className="w-3 h-3 text-gray-500" />
              </Button>
              {notification.type !== 'email_verification' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeNotification(notification.id);
                  }}
                  title="Remove notification"
                >
                  <X className="w-3 h-3 text-gray-500" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {(notifications.length === 0) && (
          <div className="p-4 text-center text-steel-gray">
            No new notifications
          </div>
        )}
        </div>
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="p-2 flex justify-between items-center bg-white border-t">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-steel-gray hover:text-graphite"
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
                className="text-xs text-red-600 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('Clear All button clicked');
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {selectedNotification?.type === 'push_event' ? (
              <GitBranch className="w-5 h-5 text-log-green mr-2" />
            ) : selectedNotification?.type === 'slack_message_sent' ? (
              <MessageSquare className="w-5 h-5 text-sky-blue mr-2" />
            ) : (
              <Mail className="w-5 h-5 text-amber-500 mr-2" />
            )}
            Notification Details
          </DialogTitle>
        </DialogHeader>
        {selectedNotification && (() => {
          // Parse metadata if it's a string
          let metadata: any = null;
          if (selectedNotification.metadata) {
            try {
              metadata = typeof selectedNotification.metadata === 'string' 
                ? JSON.parse(selectedNotification.metadata) 
                : selectedNotification.metadata;
            } catch (e) {
              console.error('Failed to parse notification metadata:', e);
            }
          }

          const isPushEvent = selectedNotification.type === 'push_event';
          const isSlackMessage = selectedNotification.type === 'slack_message_sent';
          const commitUrl = metadata?.repositoryFullName && metadata?.commitSha
            ? `https://github.com/${metadata.repositoryFullName}/commit/${metadata.commitSha}`
            : null;

          return (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900">
                  {selectedNotification.title || selectedNotification.message}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedNotification.message}
                </p>
              </div>

              {/* Push Event Details */}
              {isPushEvent && metadata && (
                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold text-gray-900 text-sm">Push Event Details</h4>
                  
                  {metadata.repositoryFullName && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Repository:</span>{' '}
                      <span className="text-gray-600">{metadata.repositoryFullName}</span>
                    </div>
                  )}
                  
                  {metadata.branch && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Branch:</span>{' '}
                      <span className="text-gray-600">{metadata.branch}</span>
                    </div>
                  )}
                  
                  {metadata.author && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Author:</span>{' '}
                      <span className="text-gray-600">{metadata.author}</span>
                    </div>
                  )}
                  
                  {metadata.commitMessage && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Commit Message:</span>
                      <p className="text-gray-600 mt-1 pl-4 border-l-2 border-gray-200">
                        {metadata.commitMessage}
                      </p>
                    </div>
                  )}
                  
                  {(metadata.additions !== undefined || metadata.deletions !== undefined) && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Changes:</span>{' '}
                      <span className="text-green-600">+{metadata.additions || 0}</span>{' '}
                      <span className="text-red-600">-{metadata.deletions || 0}</span>
                      {metadata.filesChanged !== undefined && (
                        <span className="text-gray-600"> ({metadata.filesChanged} files)</span>
                      )}
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

                  {/* AI Summary Details */}
                  {metadata.aiGenerated && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <h5 className="font-semibold text-gray-900 text-sm">AI Summary</h5>
                      
                      {metadata.aiModel && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Model:</span>{' '}
                          <span className="text-gray-600">{metadata.aiModel}</span>
                        </div>
                      )}
                      
                      {metadata.aiSummary && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Summary:</span>
                          <p className="text-gray-600 mt-1">{metadata.aiSummary}</p>
                        </div>
                      )}
                      
                      {metadata.aiImpact && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Impact:</span>{' '}
                          <span className={`font-medium ${
                            metadata.aiImpact === 'high' ? 'text-red-600' :
                            metadata.aiImpact === 'medium' ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {metadata.aiImpact.toUpperCase()}
                          </span>
                        </div>
                      )}
                      
                      {metadata.aiCategory && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Category:</span>{' '}
                          <span className="text-gray-600 capitalize">{metadata.aiCategory}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Slack Message Details */}
              {isSlackMessage && metadata && (
                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold text-gray-900 text-sm">Slack Message Details</h4>
                  
                  {metadata.slackChannelName && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Channel:</span>{' '}
                      <span className="text-gray-600">#{metadata.slackChannelName}</span>
                    </div>
                  )}
                  
                  {metadata.repositoryFullName && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Repository:</span>{' '}
                      <span className="text-gray-600">{metadata.repositoryFullName}</span>
                    </div>
                  )}
                  
                  {metadata.branch && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Branch:</span>{' '}
                      <span className="text-gray-600">{metadata.branch}</span>
                    </div>
                  )}
                  
                  {metadata.commitMessage && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Commit:</span>
                      <p className="text-gray-600 mt-1 pl-4 border-l-2 border-gray-200">
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

                  {/* AI Model Used */}
                  {metadata.aiModel && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="text-sm">
                        <span className="font-medium text-gray-700">AI Model Used:</span>{' '}
                        <span className="text-gray-600 font-mono">{metadata.aiModel}</span>
                      </div>
                      {metadata.aiGenerated === false && (
                        <p className="text-xs text-gray-500 mt-1">
                          AI summary was not generated (fallback message used)
                        </p>
                      )}
                    </div>
                  )}

                  {/* AI Summary if available */}
                  {metadata.aiGenerated && metadata.aiSummary && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <h5 className="font-semibold text-gray-900 text-sm">AI Summary</h5>
                      <p className="text-sm text-gray-600">{metadata.aiSummary}</p>
                      {metadata.aiImpact && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Impact:</span>{' '}
                          <span className={`font-medium ${
                            metadata.aiImpact === 'high' ? 'text-red-600' :
                            metadata.aiImpact === 'medium' ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {metadata.aiImpact.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Basic Info for all notifications */}
              <div className="border-t pt-4 text-sm text-gray-500">
                <p><strong>Type:</strong> {selectedNotification.type.replace('_', ' ')}</p>
                <p><strong>Created:</strong> {new Date(selectedNotification.createdAt).toLocaleString()}</p>
                {metadata?.pushEventId && (
                  <p><strong>Push Event ID:</strong> {metadata.pushEventId}</p>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setSelectedNotification(null)}
                >
                  Close
                </Button>
                {selectedNotification.type !== 'email_verification' && (
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
      </DialogContent>
    </Dialog>
    </>
  );
} 