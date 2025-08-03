import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { User, LogIn, LogOut, Settings } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { NotificationsDropdown } from "./notifications-dropdown";

interface User {
  id: number;
  username: string;
  email: string | null;
  githubConnected: boolean;
  emailVerified: boolean;
}

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return; 
    }

    // Fetch user profile
    apiRequest("GET", "/api/profile")
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setUser(data.user);
        }
      })
      .catch(error => {
        console.error("Failed to fetch user profile:", error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    queryClient.clear(); // Clear all queries from cache
    setLocation('/');
  };

  const handleProtectedNavigation = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to access this page.",
        variant: "destructive",
      });
      setLocation('/login');
      return;
    }
    setLocation(path);
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-3">
              <Logo size="md" />
              <div>
                <h1 className="text-xl font-bold text-log-green">PushLog</h1>
                <p className="text-xs text-steel-gray hidden sm:block">GitHub ↔ Slack Integration</p>
              </div>
            </Link>
            {user && (
              <nav className="hidden md:flex space-x-8 ml-8">
                <Link 
                  href="/dashboard"
                  className="text-log-green hover:text-graphite transition-colors"
                >
                  Dashboard
                </Link>
                <Link 
                  href="/integrations"
                  className="text-log-green hover:text-graphite transition-colors"
                >
                  Integrations
                </Link>
                <Link 
                  href="/repositories"
                  className="text-log-green hover:text-graphite transition-colors"
                >
                  Repositories
                </Link>
              </nav>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {loading ? null : (user ? (
              <>
                <NotificationsDropdown isEmailVerified={user.emailVerified} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="flex items-center space-x-2 hover:bg-gray-100 focus:bg-gray-100 active:bg-gray-100 focus-visible:ring-0 focus:ring-0"
                    >
                      <div className="w-8 h-8 bg-log-green rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-sm font-medium hidden md:block text-graphite">
                        {user.username}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="cursor-pointer flex items-center">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings" className="cursor-pointer flex items-center">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleLogout} 
                      className="cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50 focus:bg-red-50"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Link href="/login">
                <Button variant="outline" className="bg-log-green text-sm text-white font-medium px-4 py-2 hover:bg-green-600">
                  <LogIn className="w-5 h-5 mr-2" />
                  Login
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
