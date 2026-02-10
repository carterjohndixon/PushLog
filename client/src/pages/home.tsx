import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BlurText } from "@/components/ui/blur-text";
import { 
  Github, 
  Zap, 
  Brain, 
  Layers, 
  Webhook, 
  Users, 
  TrendingUp,
  GitBranch,
  Link as LinkIcon,
  Bell,
  Check,
  Plus,
  Pause,
  Settings,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { SiSlack } from "react-icons/si";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: number;
  username: string;
  email: string | null;
  githubConnected: boolean;
}

export default function Home() {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to fetch user profile (optional - home page works without it)
    fetch("/api/profile", {
      credentials: "include", // Send cookie if it exists
      headers: {
        "Accept": "application/json"
      }
    })
      .then(async (response) => {
        // If 401, user is not logged in - that's fine for home page
        if (response.status === 401) {
          setLoading(false);
          return; // User stays null, show public home page
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
        // Silently handle errors - home page works without user data
        console.log("User not logged in (home page is public)");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleGitHubConnect = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in or sign up to connect your GitHub account.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Use apiRequest to make an authenticated request
      const response = await apiRequest("GET", "/api/github/connect");
      
      // Parse the JSON response to get the URL
      const data = await response.json();
      
      if (data.url) {
        // Store the state for verification in the callback
        if (data.state) {
          localStorage.setItem('github_oauth_state', data.state);
        }
        localStorage.setItem('returnPath', window.location.pathname);
        window.location.href = data.url;
      } else {
        throw new Error('No redirect URL received');
      }
    } catch (error) {
      console.error('Failed to initiate GitHub connection:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to GitHub. Please try again.",
        variant: "destructive",
      });
    }
  };

  // TODO: Implement Slack OAuth flow
  const handleSlackConnect = () => {
    // Slack OAuth flow would be implemented here
    return;
  };

  const scrollToDashboard = () => {
    document.getElementById("dashboard-preview")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-forest-gradient">
      <Header />
      
      {/* Hero Section */}
      <section className="relative bg-muted/60 py-20 overflow-hidden">
        {/* Subtle glow behind hero */}
        <div className="absolute inset-0 pointer-events-none flex justify-center -top-1/4" aria-hidden>
          <div className="w-[600px] h-[400px] rounded-full bg-primary/10 blur-[100px]" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-6 opacity-0-init animate-landing-in animate-landing-in-delay-1 inline-flex items-center gap-1.5 px-3 py-1 text-primary border-primary/30">
              <Sparkles className="w-3.5 h-3.5" />
              AI-powered summaries
            </Badge>
            <div className="flex justify-center mb-6 opacity-0-init animate-landing-in animate-landing-in-delay-1">
              <Logo size="xl" className="shadow-lg" />
            </div>
            <h1 className="text-5xl font-bold text-hero mb-6">
              <BlurText
                text="Bridge Your GitHub & Slack"
                delay={80}
                animateBy="words"
                direction="top"
                stepDuration={0.4}
                className="text-hero"
              />
              <br />
              <BlurText
                text="Seamlessly"
                delay={80}
                animateBy="words"
                direction="top"
                stepDuration={0.5}
                className="text-brand-gradient"
              />
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto opacity-0-init animate-landing-in animate-landing-in-delay-3">
              Automate your development workflow with intelligent push notifications, code summaries, 
              and team collaboration tools that keep everyone in sync.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center opacity-0-init animate-landing-in animate-landing-in-delay-4">
              <Button 
                onClick={ user ? handleGitHubConnect : () => window.location.href = '/login'}
                className="bg-log-green text-white px-8 py-4 rounded-lg hover:bg-green-600 transition-all font-semibold text-lg btn-glow btn-shine"
              >
                <Github className="mr-2 w-5 h-5" />
                {user ? 'Connect GitHub' : 'Get Started'}
              </Button>
              <Button 
                variant="outline"
                onClick={scrollToDashboard}
                className="border-2 border-border hover:border-primary/50 hover:bg-muted/50 px-8 py-4 rounded-lg font-semibold text-lg transition-all"
              >
                See the dashboard
                <ChevronRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-6 opacity-0-init animate-landing-in animate-landing-in-delay-5">
              Free to start · No credit card required
            </p>
          </div>

          {/* Integration Flow Preview */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-2 max-w-4xl mx-auto items-center justify-center">
            <Card className="w-full md:max-w-[240px] text-center shadow-lg border-border bg-card hover:shadow-xl hover:border-primary/30 transition-all duration-300 opacity-0-init animate-landing-in animate-landing-in-delay-3">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary/10 rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <Github className="text-log-green dark:text-emerald-400 text-2xl w-8 h-8" />
                </div>
                <h3 className="font-semibold text-hero mb-2">Push Detection</h3>
                <p className="text-muted-foreground text-sm">Automatically detects new commits and changes</p>
              </CardContent>
            </Card>
            <ChevronRight className="w-8 h-8 text-muted-foreground hidden md:block shrink-0 opacity-0-init animate-landing-in animate-landing-in-delay-4" />
            <Card className="w-full md:max-w-[240px] text-center shadow-lg border-border bg-card hover:shadow-xl hover:border-primary/30 transition-all duration-300 opacity-0-init animate-landing-in animate-landing-in-delay-4">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary/10 rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <Brain className="text-log-green dark:text-emerald-400 text-2xl w-8 h-8" />
                </div>
                <h3 className="font-semibold text-hero mb-2">AI Summary</h3>
                <p className="text-muted-foreground text-sm">Generates intelligent code summaries</p>
              </CardContent>
            </Card>
            <ChevronRight className="w-8 h-8 text-muted-foreground hidden md:block shrink-0 opacity-0-init animate-landing-in animate-landing-in-delay-5" />
            <Card className="w-full md:max-w-[240px] text-center shadow-lg border-border bg-card hover:shadow-xl hover:border-primary/30 transition-all duration-300 opacity-0-init animate-landing-in animate-landing-in-delay-5">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary/10 rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <SiSlack className="text-log-green dark:text-emerald-400 text-2xl w-8 h-8" />
                </div>
                <h3 className="font-semibold text-hero mb-2">Team Notification</h3>
                <p className="text-muted-foreground text-sm">Sends formatted updates to Slack channels</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section id="dashboard-preview" className="py-20 bg-muted/50 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-hero mb-4">
              Powerful Dashboard Experience
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Monitor all your integrations, configure settings, and track performance from one central hub.
            </p>
          </div>

          {/* Dashboard Mockup */}
          <Card className="overflow-hidden shadow-2xl border-border bg-card rounded-t-[var(--card-radius)]">
            {/* Browser-style chrome */}
            <div className="bg-muted/80 border-b border-border px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400/80" />
                <span className="w-3 h-3 rounded-full bg-amber-400/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
              </div>
              <div className="flex-1 flex justify-center">
                <span className="text-xs text-muted-foreground font-medium">PushLog Dashboard</span>
              </div>
              <div className="w-12" />
            </div>
            {/* Dashboard Header */}
            <div className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Logo size="md" />
                <div>
                  <h1 className="text-xl font-bold text-brand-gradient">PushLog</h1>
                  <p className="text-xs text-muted-foreground">GitHub ↔ Slack Integration</p>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="p-6 bg-muted/30">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
                <p className="text-muted-foreground mt-2">Manage your integrations and monitor repository activity</p>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Active Integrations</p>
                        <p className="text-2xl font-bold text-log-green">8</p>
                      </div>
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                        <LinkIcon className="text-log-green w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Connected Repos</p>
                        <p className="text-2xl font-bold text-log-green">12</p>
                      </div>
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Github className="text-log-green w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Daily Pushes</p>
                        <p className="text-2xl font-bold text-foreground">24</p>
                      </div>
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                        <GitBranch className="text-log-green w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Notifications Sent</p>
                        <p className="text-2xl font-bold text-muted-foreground">156</p>
                      </div>
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Bell className="text-log-green w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Connected Repositories */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-semibold text-foreground">Connected Repositories</CardTitle>
                      <Button 
                        size="sm" 
                        className="btn-glow"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Repo
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <div key={i} className="flex items-center justify-between p-3 border border-border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-secondary rounded flex items-center justify-center">
                              <Github className="text-foreground w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">example/repository-{i}</p>
                              <p className="text-xs text-muted-foreground">Last push: 2 hours ago</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 rounded-full bg-log-green" />
                            <Badge variant="default" className="text-xs">
                              Active
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Active Integrations */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-foreground">Active Integrations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[1, 2].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                              <SiSlack className="text-log-green" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">example/repository-{i}</p>
                              <p className="text-sm text-muted-foreground">#dev-updates channel</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 rounded-full bg-log-green" />
                            <Badge variant="default" className="text-xs">
                              Active
                            </Badge>
                            <Button size="sm" variant="ghost">
                              <Pause className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <Card className="mt-8">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-foreground">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button 
                      variant="outline" 
                      className="flex items-center justify-center space-x-2 p-6 h-auto"
                    >
                      <Plus className="w-5 h-5 text-log-green" />
                      <span>Set Up New Integration</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="flex items-center justify-center space-x-2 p-6 h-auto"
                    >
                      <TrendingUp className="w-5 h-5 text-sky-blue" />
                      <span>View Analytics</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="flex items-center justify-center space-x-2 p-6 h-auto"
                    >
                      <Settings className="w-5 h-5 text-muted-foreground" />
                      <span>Integration Settings</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </Card>
        </div>
      </section>

      {/* Integration Setup */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">
              Simple <span className="text-log-green">Integration Setup</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Connect your GitHub repositories and Slack workspaces in just a few clicks.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            {/* Setup Steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              {/* GitHub Setup */}
              <Card className="border-2 border-border hover:border-log-green transition-colors">
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-secondary rounded-xl mx-auto mb-4 flex items-center justify-center">
                      <Github className="text-foreground text-3xl w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-bold text-foreground mb-2">Connect GitHub</h3>
                    <p className="text-muted-foreground">Authorize PushLog to access your repositories</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-log-green rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-foreground">OAuth authentication</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-log-green rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-foreground">Repository selection</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-log-green rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-foreground">Webhook configuration</span>
                    </div>
                  </div>
                  <Button 
                    onClick={handleGitHubConnect}
                    variant="outline"
                    className="w-full bg-foreground text-background hover:bg-foreground/90 py-3 rounded-lg transition-colors mt-6 font-semibold"
                  >
                    <Github className="mr-2 w-5 h-5" />
                    Authorize GitHub
                  </Button>
                </CardContent>
              </Card>

              {/* Slack Setup */}
              <Card className="border-2 border-border hover:border-log-green transition-colors">
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-log-green rounded-xl mx-auto mb-4 flex items-center justify-center">
                      <SiSlack className="text-white text-3xl" />
                    </div>
                    <h3 className="text-2xl font-bold text-foreground mb-2">Connect Slack</h3>
                    <p className="text-muted-foreground">Link your Slack workspace for notifications</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-log-green rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-foreground">Workspace integration</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-log-green rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-foreground">Channel configuration</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-log-green rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-foreground">Message formatting</span>
                    </div>
                  </div>
                  <Button 
                    onClick={handleSlackConnect}
                    className="w-full bg-log-green text-white py-3 rounded-lg hover:bg-green-600 transition-all mt-6 font-semibold btn-glow"
                  >
                    <SiSlack className="mr-2" />
                    Add to Slack
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Configuration Panel - matches real app: Integrations → per-integration settings */}
            <Card className="bg-muted/50">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold text-foreground mb-6 text-center">Configuration Options</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <Label htmlFor="slack-channel" className="block text-sm font-medium text-foreground mb-2">
                      Slack channel
                    </Label>
                    <Select>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dev-updates">#dev-updates</SelectItem>
                        <SelectItem value="general">#general</SelectItem>
                        <SelectItem value="releases">#releases</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="notification-level" className="block text-sm font-medium text-foreground mb-2">
                      Notification level
                    </Label>
                    <Select>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select notification level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All pushes</SelectItem>
                        <SelectItem value="main_only">Main branch only</SelectItem>
                        <SelectItem value="tagged_only">Tagged releases only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2 md:col-span-2">
                    <Checkbox id="include-summaries" defaultChecked />
                    <Label htmlFor="include-summaries" className="text-foreground">
                      Include commit summaries
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">
              Powerful Features for <span className="text-log-green">Developer Teams</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Everything you need to streamline your development workflow and keep your team synchronized.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Real-time Notifications */}
            <Card className="card-lift hover:shadow-xl hover:border-primary/20 transition-all duration-300 border-border bg-card">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-log-green rounded-lg flex items-center justify-center mb-4">
                  <Zap className="text-white text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">Real-time Notifications</h3>
                <p className="text-muted-foreground">
                  Instant Slack notifications when code is pushed, with intelligent filtering and batching options.
                </p>
              </CardContent>
            </Card>

            {/* AI Code Summaries */}
            <Card className="card-lift hover:shadow-xl hover:border-primary/20 transition-all duration-300 border-border bg-card opacity-0-init animate-landing-in animate-landing-in-delay-2">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-log-green rounded-lg flex items-center justify-center mb-4">
                  <Brain className="text-white text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">AI Code Summaries</h3>
                <p className="text-muted-foreground">
                  Automatically generated summaries of code changes help team members understand what's been updated.
                </p>
              </CardContent>
            </Card>

            {/* Multi-Repository Support */}
            <Card className="card-lift hover:shadow-xl hover:border-primary/20 transition-all duration-300 border-border bg-card opacity-0-init animate-landing-in animate-landing-in-delay-3">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center mb-4">
                  <Layers className="text-foreground text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">Multi-Repository</h3>
                <p className="text-muted-foreground">
                  Connect unlimited GitHub repositories and manage all integrations from a single dashboard.
                </p>
              </CardContent>
            </Card>

            {/* Custom Webhooks */}
            <Card className="card-lift hover:shadow-xl hover:border-primary/20 transition-all duration-300 border-border bg-card opacity-0-init animate-landing-in animate-landing-in-delay-4">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-log-green rounded-lg flex items-center justify-center mb-4">
                  <Webhook className="text-white text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">Custom Webhooks</h3>
                <p className="text-muted-foreground">
                  Flexible webhook configuration with custom payloads and advanced filtering capabilities.
                </p>
              </CardContent>
            </Card>

            {/* Team Management */}
            <Card className="card-lift hover:shadow-xl hover:border-primary/20 transition-all duration-300 border-border bg-card opacity-0-init animate-landing-in animate-landing-in-delay-5">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-log-green rounded-lg flex items-center justify-center mb-4">
                  <Users className="text-white text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">Team Management</h3>
                <p className="text-muted-foreground">
                  Role-based access control and team member management with granular permission settings.
                </p>
              </CardContent>
            </Card>

            {/* Analytics & Insights */}
            <Card className="card-lift hover:shadow-xl hover:border-primary/20 transition-all duration-300 border-border bg-card opacity-0-init animate-landing-in animate-landing-in-delay-6">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="text-foreground text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">Analytics & Insights</h3>
                <p className="text-muted-foreground">
                  Detailed analytics on push frequency, team activity, and integration performance metrics.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Legal Links Section
      <section className="py-12 bg-background border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <Link href="/support" className="hover:text-log-green transition-colors">
              Support
            </Link>
            <Link href="/terms" className="hover:text-log-green transition-colors">
              Terms of Service
            </Link>
            <Link href="/policy" className="hover:text-log-green transition-colors">
              Privacy Policy
            </Link>
            <Link href="/sub-processors" className="hover:text-log-green transition-colors">
              Sub-Processors
            </Link>
          </div>
        </div>
      </section> */}

      <Footer />
    </div>
  );
}
