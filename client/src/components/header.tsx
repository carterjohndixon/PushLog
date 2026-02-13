import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { User, LogIn, LogOut, Settings, Sun, Moon, Monitor } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NotificationsDropdown } from "./notifications-dropdown";
import { useTheme, type Theme } from "@/lib/theme";
import { PROFILE_QUERY_KEY, fetchProfile, type ProfileUser } from "@/lib/profile";

export function Header() {
  const { data: profileResponse, isLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    retry: false,
  });
  const user: ProfileUser | null = profileResponse?.user ?? null;
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/logout");
    } catch (error) {
      console.error("Logout error:", error);
    }
    queryClient.removeQueries({ queryKey: PROFILE_QUERY_KEY });
    queryClient.clear();
    // When already on home, setLocation("/") is a no-op so Home never remounts and
    // its local user state stays set. Force a full reload so Home remounts and shows logged-out state.
    if (location === "/") {
      window.location.href = "/";
      return;
    }
    setLocation("/");
  };

  const { theme, setTheme } = useTheme();

  const isStagingHost = typeof window !== "undefined" && window.location.hostname === "staging.pushlog.ai";

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/integrations", label: "Integrations" },
    { href: "/repositories", label: "Repositories" },
    { href: "/search", label: "Search" },
    { href: "/analytics", label: "Analytics" },
    { href: "/models", label: "Models" },
    ...(isStagingHost ? [{ href: "/admin", label: "Admin" }] : []),
  ] as const;

  const themeCycle: Theme[] = ["light", "dark", "system"];
  const cycleTheme = () => {
    const currentIndex = themeCycle.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeCycle.length;
    setTheme(themeCycle[nextIndex]);
  };
  const themeIcons: Record<Theme, React.ReactNode> = {
    light: <Sun className="h-4 w-4" />,
    dark: <Moon className="h-4 w-4" />,
    system: <Monitor className="h-4 w-4" />,
  };

  return (
    <header className="bg-background border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-3">
              <Logo size="md" />
              <div>
                <h1 className="text-xl font-bold text-brand-gradient">PushLog</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">GitHub ↔ Slack Integration</p>
              </div>
            </Link>
            {user && (
              <nav className="hidden md:flex space-x-8 ml-8">
                {navLinks.map(({ href, label }) => {
                  const isActive = location === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`transition-colors duration-200 ${
                        isActive
                          ? "text-foreground font-semibold"
                          : "text-log-green hover:text-foreground"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label={`Theme: ${theme} (click to cycle)`}
              onClick={cycleTheme}
            >
              {themeIcons[theme]}
            </Button>
            {isLoading ? null : (user ? (
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
                <Button variant="glow" className="text-sm font-medium px-4 py-2">
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
