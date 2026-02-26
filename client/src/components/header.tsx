import * as React from "react";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { User, LogIn, LogOut, Settings, Sun, Moon, Monitor, Menu } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
  const [navOpen, setNavOpen] = React.useState(false);
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

  const isUserStagingAdmin = user?.email?.toLowerCase() === import.meta.env.VITE_ADMIN_STAGING_EMAIL?.toLowerCase();

  const { theme, setTheme } = useTheme();

  const isStagingHost = typeof window !== "undefined" && window.location.hostname === "staging.pushlog.ai";

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/integrations", label: "Integrations" },
    { href: "/repositories", label: "Repositories" },
    { href: "/search", label: "Search" },
    { href: "/analytics", label: "Analytics" },
    { href: "/models", label: "Models" },
    { href: "/organization", label: "Organization" },
    ...(isStagingHost && isUserStagingAdmin ? [{ href: "/admin", label: "Admin" }] : []),
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
      <div className="w-full px-4 sm:px-6 lg:px-8 min-w-0">
        <div className="flex justify-between items-center h-16 gap-2">
          <div className="flex items-center min-w-0 flex-1 gap-2 sm:gap-4">
            <Link href="/" className="flex items-center space-x-3 flex-shrink-0">
              <Logo size="md" />
              <div className="hidden sm:flex flex-col justify-center min-w-0">
                <h1 className="text-xl font-bold text-brand-gradient leading-tight">PushLog</h1>
                <p className="text-xs text-muted-foreground whitespace-nowrap truncate leading-tight">
                  GitHub ↔ Slack Integration
                </p>
              </div>
            </Link>
            {user && (
              <>
                <div className="hidden lg:block min-w-0 flex-1 overflow-x-auto">
                  <nav className="flex items-center space-x-6 xl:space-x-8 ml-2 xl:ml-6 pr-2" aria-label="Main">
                    {navLinks.map(({ href, label }) => {
                      const isActive = location === href;
                      return (
                        <Link
                          key={href}
                          href={href}
                          className={`whitespace-nowrap transition-colors duration-200 ${
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
                </div>
                <Sheet open={navOpen} onOpenChange={setNavOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden shrink-0"
                      aria-label="Open menu"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72 pt-10">
                    <nav className="flex flex-col gap-1" aria-label="Main">
                      {navLinks.map(({ href, label }) => {
                        const isActive = location === href;
                        return (
                          <Link
                            key={href}
                            href={href}
                            onClick={() => setNavOpen(false)}
                            className={`rounded-lg px-3 py-2 text-left font-medium transition-colors ${
                              isActive
                                ? "bg-primary/10 text-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            {label}
                          </Link>
                        );
                      })}
                    </nav>
                  </SheetContent>
                </Sheet>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 pl-2 sm:pl-4 border-l border-border flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
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
                      <span className="text-sm font-medium hidden lg:block text-foreground truncate max-w-[120px]">
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
