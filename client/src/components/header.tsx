import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { User, LogIn, LogOut, Settings, Sun, Moon, Monitor, Check } from "lucide-react";
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
import { useTheme, type Theme } from "@/lib/theme";

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
    fetch("/api/profile", {
      credentials: "include", // Send cookie if it exists
      headers: {
        "Accept": "application/json"
      }
    })
      .then(async (response) => {
        // If 401, user is not logged in - that's fine, just don't set user
        if (response.status === 401) {
          setLoading(false);
          return; // User stays null, show public header
        }
        
        // If other error, throw to be caught
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        // Success - user is logged in
        const data = await response.json();
        if (data.success) {
          setUser(data.user);
        }
      })
      .catch(error => {
        // Silently handle errors - header works without user data
        console.log("User not logged in (header is public)");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/logout");
    } catch (error) {
      console.error("Logout error:", error);
    }
    
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

  const { theme, setTheme, resolvedTheme } = useTheme();

  const themeOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
    { value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
    { value: "system", label: "System", icon: <Monitor className="h-4 w-4" /> },
  ];

  return (
    <header className="bg-background border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-3">
              <Logo size="md" />
              <div>
                <h1 className="text-xl font-bold text-log-green">PushLog</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">GitHub ↔ Slack Integration</p>
              </div>
            </Link>
            {user && (
              <nav className="hidden md:flex space-x-8 ml-8">
                <Link 
                  href="/dashboard"
                  className="text-log-green hover:text-foreground transition-colors"
                >
                  Dashboard
                </Link>
                <Link 
                  href="/integrations"
                  className="text-log-green hover:text-foreground transition-colors"
                >
                  Integrations
                </Link>
                <Link 
                  href="/repositories"
                  className="text-log-green hover:text-foreground transition-colors"
                >
                  Repositories
                </Link>
              </nav>
            )}
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Theme">
                  {resolvedTheme === "dark" ? (
                    <Moon className="h-4 w-4" />
                  ) : (
                    <Sun className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {themeOptions.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className="flex items-center gap-2"
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                    {theme === opt.value && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {loading ? null : (user ? (
              <>
                <NotificationsDropdown isEmailVerified={user.emailVerified} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="flex items-center space-x-2"
                    >
                      <div className="w-8 h-8 bg-log-green rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-sm font-medium hidden md:block text-foreground">
                        {user.username}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link href="/settings" className="cursor-pointer flex items-center">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleLogout} 
                      className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
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
