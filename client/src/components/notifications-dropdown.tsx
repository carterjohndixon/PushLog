import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Bell, Mail, MessageSquare, GitBranch, X, Eye, AlertCircle } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { formatRelativeOrLocal } from "@/lib/date";

interface NotificationsDropdownProps {
  isEmailVerified: boolean;
}

export function NotificationsDropdown({ isEmailVerified }: NotificationsDropdownProps) {
  const { notifications, count, hasUnread, markAllAsRead, removeNotification, clearAllNotifications, refetchNotifications } = useNotifications();

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
            <span className={`absolute -top-1 -right-1 bg-log-green text-white rounded-full flex items-center justify-center leading-none font-semibold ${
              count > 99 ? 'min-w-[26px] h-5 px-1.5 text-[10px]' : count >= 10 ? 'w-5 h-5 text-[10px]' : 'w-4 h-4 text-[10px]'
            }`}>
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[50vh] flex flex-col">
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-popover [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted [scrollbar-color:hsl(var(--muted))_hsl(var(--popover))]">
          {notifications.map((notification) => (
          <div 
            key={notification.id} 
            className={`flex items-center justify-between gap-2 p-4 min-w-0 [&:hover]:!bg-muted ${
              notification.type === 'email_verification' ? 'bg-amber-500/10 dark:bg-amber-500/20 border-b border-border' : 
              (notification.type === 'openrouter_error' || notification.type === 'slack_delivery_failed' || notification.type === 'incident_alert' || (notification as { type: string }).type === 'budget_alert')
                ? (!notification.isRead ? 'bg-destructive/10 border-l-4 border-destructive' : '')
                : (!notification.isRead ? 'bg-primary/10 border-l-4 border-primary' : '')
            }`}
          >
            <div className="flex items-center flex-1 min-w-0 overflow-hidden">
              {notification.type === 'push_event' ? (
                <GitBranch className="w-5 h-5 text-log-green mr-3 flex-shrink-0" />
              ) : notification.type === 'slack_message_sent' ? (
                <MessageSquare className="w-5 h-5 text-sky-blue mr-3 flex-shrink-0" />
              ) : notification.type === 'slack_delivery_failed' || notification.type === 'openrouter_error' || notification.type === 'incident_alert' || (notification as { type: string }).type === 'budget_alert' ? (
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
                  notification.type === 'slack_delivery_failed' || notification.type === 'openrouter_error' || notification.type === 'incident_alert' || (notification as { type: string }).type === 'budget_alert' ? 'text-destructive' : 'text-foreground'
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
                  window.dispatchEvent(new CustomEvent("show-notification-modal", { detail: { notification } }));
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
    </>
  );
} 