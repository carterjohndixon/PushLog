import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
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
  Play,
  Check,
  Plus,
  Pause,
  Settings
} from "lucide-react";
import { SiSlack } from "react-icons/si";
import { useState, useEffect } from "react";
import { Link } from "wouter";
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

  return (
    <div className="min-h-screen bg-forest-gradient">
      <Header />
      
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-green-50 to-blue-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="flex justify-center mb-6">
              <Logo size="xl" className="shadow-lg" />
            </div>
            <h1 className="text-5xl font-bold text-graphite mb-6">
              Bridge Your GitHub & Slack
              <span className="text-log-green"> Seamlessly</span>
            </h1>
            <p className="text-xl text-steel-gray mb-8 max-w-3xl mx-auto">
              Automate your development workflow with intelligent push notifications, code summaries, 
              and team collaboration tools that keep everyone in sync.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={ user ? handleGitHubConnect : () => window.location.href = '/login'}
                className="bg-log-green text-white px-8 py-4 rounded-lg hover:bg-green-600 transition-colors font-semibold text-lg"
              >
                <Github className="mr-2 w-5 h-5" />
                {user ? 'Connect GitHub' : 'Get Started'}
              </Button>
              {/* <Button 
                variant="outline"
                className="border-2 border-sky-blue text-sky-blue px-8 py-4 rounded-lg hover:bg-sky-blue hover:text-white transition-colors font-semibold text-lg"
              >
                <Play className="mr-2 w-5 h-5" />
                Watch Demo
              </Button> */}
            </div>
          </div>

          {/* Integration Flow Preview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <Card className="text-center shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-gray-900 rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <Github className="text-white text-2xl w-8 h-8" />
                </div>
                <h3 className="font-semibold text-graphite mb-2">Push Detection</h3>
                <p className="text-steel-gray text-sm">Automatically detects new commits and changes</p>
              </CardContent>
            </Card>
            <Card className="text-center shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-log-green rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <Brain className="text-white text-2xl w-8 h-8" />
                </div>
                <h3 className="font-semibold text-graphite mb-2">AI Summary</h3>
                <p className="text-steel-gray text-sm">Generates intelligent code summaries</p>
              </CardContent>
            </Card>
            <Card className="text-center shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-sky-blue rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <SiSlack className="text-white text-2xl" />
                </div>
                <h3 className="font-semibold text-graphite mb-2">Team Notification</h3>
                <p className="text-steel-gray text-sm">Sends formatted updates to Slack channels</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-graphite mb-4">
              Powerful Dashboard Experience
            </h2>
            <p className="text-xl text-steel-gray max-w-2xl mx-auto">
              Monitor all your integrations, configure settings, and track performance from one central hub.
            </p>
          </div>

          {/* Dashboard Mockup */}
          <Card className="overflow-hidden shadow-2xl">
            {/* Dashboard Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Logo size="md" />
                <div>
                  <h1 className="text-xl font-bold text-log-green">PushLog</h1>
                  <p className="text-xs text-steel-gray">GitHub ↔ Slack Integration</p>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="p-6 bg-gray-50">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-graphite">Dashboard</h1>
                <p className="text-steel-gray mt-2">Manage your integrations and monitor repository activity</p>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-steel-gray">Active Integrations</p>
                        <p className="text-2xl font-bold text-log-green">8</p>
                      </div>
                      <div className="w-12 h-12 bg-log-green bg-opacity-10 rounded-lg flex items-center justify-center">
                        <LinkIcon className="text-log-green w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-steel-gray">Connected Repos</p>
                        <p className="text-2xl font-bold text-sky-blue">12</p>
                      </div>
                      <div className="w-12 h-12 bg-sky-blue bg-opacity-10 rounded-lg flex items-center justify-center">
                        <Github className="text-sky-blue w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-steel-gray">Daily Pushes</p>
                        <p className="text-2xl font-bold text-graphite">24</p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <GitBranch className="text-log-green w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-steel-gray">Notifications Sent</p>
                        <p className="text-2xl font-bold text-steel-gray">156</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Bell className="text-sky-blue w-6 h-6" />
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
                      <CardTitle className="text-lg font-semibold text-graphite">Connected Repositories</CardTitle>
                      <Button 
                        size="sm" 
                        className="bg-log-green text-white hover:bg-green-600"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Repo
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <div key={i} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                              <Github className="text-white w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-medium text-graphite">example/repository-{i}</p>
                              <p className="text-xs text-steel-gray">Last push: 2 hours ago</p>
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
                    <CardTitle className="text-lg font-semibold text-graphite">Active Integrations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[1, 2].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-log-green bg-opacity-10 rounded-lg flex items-center justify-center">
                              <SiSlack className="text-log-green" />
                            </div>
                            <div>
                              <p className="font-medium text-graphite">example/repository-{i}</p>
                              <p className="text-sm text-steel-gray">#dev-updates channel</p>
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
                  <CardTitle className="text-lg font-semibold text-graphite">Quick Actions</CardTitle>
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
                      <Settings className="w-5 h-5 text-steel-gray" />
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
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-graphite mb-4">
              Simple <span className="text-log-green">Integration Setup</span>
            </h2>
            <p className="text-xl text-steel-gray max-w-2xl mx-auto">
              Connect your GitHub repositories and Slack workspaces in just a few clicks.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            {/* Setup Steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              {/* GitHub Setup */}
              <Card className="border-2 border-gray-200 hover:border-log-green transition-colors">
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-gray-900 rounded-xl mx-auto mb-4 flex items-center justify-center">
                      <Github className="text-white text-3xl w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-bold text-graphite mb-2">Connect GitHub</h3>
                    <p className="text-steel-gray">Authorize PushLog to access your repositories</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-log-green rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-graphite">OAuth authentication</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-log-green rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-graphite">Repository selection</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-log-green rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-graphite">Webhook configuration</span>
                    </div>
                  </div>
                  <Button 
                    onClick={handleGitHubConnect}
                    className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-colors mt-6 font-semibold"
                  >
                    <Github className="mr-2 w-5 h-5" />
                    Authorize GitHub
                  </Button>
                </CardContent>
              </Card>

              {/* Slack Setup */}
              <Card className="border-2 border-gray-200 hover:border-sky-blue transition-colors">
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-sky-blue rounded-xl mx-auto mb-4 flex items-center justify-center">
                      <SiSlack className="text-white text-3xl" />
                    </div>
                    <h3 className="text-2xl font-bold text-graphite mb-2">Connect Slack</h3>
                    <p className="text-steel-gray">Link your Slack workspace for notifications</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-sky-blue rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-graphite">Workspace integration</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-sky-blue rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-graphite">Channel configuration</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-sky-blue rounded-full flex items-center justify-center">
                        <Check className="text-white text-xs w-3 h-3" />
                      </div>
                      <span className="text-graphite">Message formatting</span>
                    </div>
                  </div>
                  <Button 
                    onClick={handleSlackConnect}
                    className="w-full bg-log-green text-white py-3 rounded-lg hover:bg-green-600 transition-colors mt-6 font-semibold"
                  >
                    <SiSlack className="mr-2" />
                    Add to Slack
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Configuration Panel */}
            <Card className="bg-gray-50">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold text-graphite mb-6 text-center">Configuration Options</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <Label htmlFor="slack-channel" className="block text-sm font-medium text-graphite mb-2">
                      Default Slack Channel
                    </Label>
                    <Select>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="#dev-updates">#dev-updates</SelectItem>
                        <SelectItem value="#general">#general</SelectItem>
                        <SelectItem value="#notifications">#notifications</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="notification-frequency" className="block text-sm font-medium text-graphite mb-2">
                      Notification Frequency
                    </Label>
                    <Select>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="every_push">Every push</SelectItem>
                        <SelectItem value="batched_hourly">Batched (hourly)</SelectItem>
                        <SelectItem value="daily_summary">Daily summary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="include-summaries" />
                    <Label htmlFor="include-summaries" className="text-graphite">
                      Include code summaries
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="mention-members" />
                    <Label htmlFor="mention-members" className="text-graphite">
                      Mention relevant team members
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-graphite mb-4">
              Powerful Features for <span className="text-log-green">Developer Teams</span>
            </h2>
            <p className="text-xl text-steel-gray max-w-2xl mx-auto">
              Everything you need to streamline your development workflow and keep your team synchronized.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Real-time Notifications */}
            <Card className="hover:shadow-xl transition-shadow">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-log-green rounded-lg flex items-center justify-center mb-4">
                  <Zap className="text-white text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-graphite mb-3">Real-time Notifications</h3>
                <p className="text-steel-gray">
                  Instant Slack notifications when code is pushed, with intelligent filtering and batching options.
                </p>
              </CardContent>
            </Card>

            {/* AI Code Summaries */}
            <Card className="hover:shadow-xl transition-shadow">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-sky-blue rounded-lg flex items-center justify-center mb-4">
                  <Brain className="text-white text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-graphite mb-3">AI Code Summaries</h3>
                <p className="text-steel-gray">
                  Automatically generated summaries of code changes help team members understand what's been updated.
                </p>
              </CardContent>
            </Card>

            {/* Multi-Repository Support */}
            <Card className="hover:shadow-xl transition-shadow">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-steel-gray rounded-lg flex items-center justify-center mb-4">
                  <Layers className="text-white text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-graphite mb-3">Multi-Repository</h3>
                <p className="text-steel-gray">
                  Connect unlimited GitHub repositories and manage all integrations from a single dashboard.
                </p>
              </CardContent>
            </Card>

            {/* Custom Webhooks */}
            <Card className="hover:shadow-xl transition-shadow">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-log-green rounded-lg flex items-center justify-center mb-4">
                  <Webhook className="text-white text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-graphite mb-3">Custom Webhooks</h3>
                <p className="text-steel-gray">
                  Flexible webhook configuration with custom payloads and advanced filtering capabilities.
                </p>
              </CardContent>
            </Card>

            {/* Team Management */}
            <Card className="hover:shadow-xl transition-shadow">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-sky-blue rounded-lg flex items-center justify-center mb-4">
                  <Users className="text-white text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-graphite mb-3">Team Management</h3>
                <p className="text-steel-gray">
                  Role-based access control and team member management with granular permission settings.
                </p>
              </CardContent>
            </Card>

            {/* Analytics & Insights */}
            <Card className="hover:shadow-xl transition-shadow">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-steel-gray rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="text-white text-xl w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-graphite mb-3">Analytics & Insights</h3>
                <p className="text-steel-gray">
                  Detailed analytics on push frequency, team activity, and integration performance metrics.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Legal Links Section */}
      <section className="py-12 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-steel-gray">
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
      </section>

      <Footer />
    </div>
  );
}
