import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Bell, Mail } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";

interface NotificationsDropdownProps {
  isEmailVerified: boolean;
}

export function NotificationsDropdown({ isEmailVerified }: NotificationsDropdownProps) {
  const { notifications, count, hasUnread } = useNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative hover:bg-gray-100 focus:bg-gray-100 active:bg-gray-100 focus-visible:ring-0 focus:ring-0"
        >
          <Bell className="text-steel-gray hover:text-graphite transition-colors" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-log-green text-white text-xs rounded-full flex items-center justify-center">
              {count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {notifications.map((notification) => (
          <DropdownMenuItem 
            key={notification.id} 
            className={`flex items-center p-4 ${
              notification.type === 'email_verification' ? 'bg-amber-50 border-b' : ''
            }`}
          >
            {notification.type === 'push_event' ? (
              <Bell className="w-5 h-5 text-steel-gray mr-3 flex-shrink-0" />
            ) : (
              <Mail className={`w-5 h-5 mr-3 flex-shrink-0 ${
                notification.type === 'email_verification' ? 'text-amber-500' : 'text-steel-gray'
              }`} />
            )}
            <div className="flex flex-col">
              <span className={`text-sm ${
                notification.type === 'email_verification' ? 'text-amber-700 font-medium' : 'text-steel-gray'
              }`}>
                {notification.message}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(notification.createdAt).toLocaleDateString()}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
        {(notifications.length === 0) && (
          <div className="p-4 text-center text-steel-gray">
            No new notifications
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 