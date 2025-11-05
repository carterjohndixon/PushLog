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
import { Bell, Mail, MessageSquare, GitBranch, X, Eye, Trash2 } from "lucide-react";
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
  const { notifications, count, hasUnread, markAsViewed, removeNotification, clearAllNotifications } = useNotifications();
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
              notification.type === 'email_verification' ? 'bg-amber-50 border-b' : 'bg-white'
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
                onClick={() => markAsViewed()}
              >
                Mark all as read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-red-600 hover:text-red-700"
                onClick={() => {
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
        {selectedNotification && (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900">
                {selectedNotification.title || selectedNotification.message}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {selectedNotification.message}
              </p>
            </div>
            <div className="text-sm text-gray-500">
              <p><strong>Type:</strong> {selectedNotification.type.replace('_', ' ')}</p>
              <p><strong>Created:</strong> {new Date(selectedNotification.createdAt).toLocaleString()}</p>
              <p><strong>ID:</strong> {selectedNotification.id}</p>
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
                  onClick={() => {
                    removeNotification(selectedNotification.id);
                    setSelectedNotification(null);
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
} 