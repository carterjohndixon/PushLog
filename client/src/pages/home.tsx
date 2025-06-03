import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Check
} from "lucide-react";
import { SiSlack } from "react-icons/si";

export default function Home() {
  const handleGitHubConnect = () => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || "your_github_client_id";
    const redirectUri = `${window.location.origin}/auth/github/callback`;
    const scope = "repo,user:email";
    
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
  };

  const handleSlackConnect = () => {
    // Slack OAuth flow would be implemented here
    console.log("Slack OAuth flow initiated");
  };

  return (
    <div className="min-h-screen bg-white">
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
                onClick={handleGitHubConnect}
                className="bg-log-green text-white px-8 py-4 rounded-lg hover:bg-green-600 transition-colors font-semibold text-lg"
              >
                <Github className="mr-2 w-5 h-5" />
                Connect GitHub
              </Button>
              <Button 
                variant="outline"
                className="border-2 border-sky-blue text-sky-blue px-8 py-4 rounded-lg hover:bg-sky-blue hover:text-white transition-colors font-semibold text-lg"
              >
                <Play className="mr-2 w-5 h-5" />
                Watch Demo
              </Button>
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
              Powerful Dashboard for <span className="text-log-green">Integration Management</span>
            </h2>
            <p className="text-xl text-steel-gray max-w-2xl mx-auto">
              Monitor all your integrations, configure settings, and track performance from one central hub.
            </p>
          </div>

          {/* Dashboard Mockup */}
          <Card className="overflow-hidden shadow-2xl">
            {/* Dashboard Header */}
            <div className="bg-graphite text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Logo size="sm" />
                <h3 className="font-semibold">PushLog Dashboard</h3>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm">Welcome, John Developer</span>
                <div className="w-8 h-8 bg-log-green rounded-full flex items-center justify-center">
                  <Users className="text-white text-sm w-4 h-4" />
                </div>
              </div>
            </div>

            <div className="flex">
              {/* Sidebar */}
              <div className="w-64 bg-gray-50 border-r border-gray-200 p-4">
                <nav className="space-y-2">
                  <a href="#" className="flex items-center space-x-3 bg-log-green text-white px-3 py-2 rounded-lg">
                    <TrendingUp className="w-4 h-4" />
                    <span>Dashboard</span>
                  </a>
                  <a href="#" className="flex items-center space-x-3 text-graphite hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                    <Github className="w-4 h-4" />
                    <span>Repositories</span>
                  </a>
                  <a href="#" className="flex items-center space-x-3 text-graphite hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                    <SiSlack className="w-4 h-4" />
                    <span>Slack Channels</span>
                  </a>
                  <a href="#" className="flex items-center space-x-3 text-graphite hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                    <Webhook className="w-4 h-4" />
                    <span>Webhooks</span>
                  </a>
                </nav>
              </div>

              {/* Main Content */}
              <div className="flex-1 p-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-steel-gray text-sm">Active Integrations</p>
                          <p className="text-2xl font-bold text-log-green">12</p>
                        </div>
                        <div className="w-10 h-10 bg-log-green rounded-lg flex items-center justify-center">
                          <LinkIcon className="text-white w-5 h-5" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-steel-gray text-sm">Daily Pushes</p>
                          <p className="text-2xl font-bold text-sky-blue">48</p>
                        </div>
                        <div className="w-10 h-10 bg-sky-blue rounded-lg flex items-center justify-center">
                          <GitBranch className="text-white w-5 h-5" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-steel-gray text-sm">Notifications Sent</p>
                          <p className="text-2xl font-bold text-graphite">156</p>
                        </div>
                        <div className="w-10 h-10 bg-steel-gray rounded-lg flex items-center justify-center">
                          <Bell className="text-white w-5 h-5" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-steel-gray text-sm">Team Members</p>
                          <p className="text-2xl font-bold text-log-green">8</p>
                        </div>
                        <div className="w-10 h-10 bg-log-green rounded-lg flex items-center justify-center">
                          <Users className="text-white w-5 h-5" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Connected Repositories */}
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-graphite">Connected Repositories</h3>
                        <Button className="bg-log-green text-white px-3 py-1 rounded text-sm hover:bg-green-600 transition-colors">
                          <Github className="mr-1 w-3 h-3" />
                          Add Repo
                        </Button>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                              <Github className="text-white text-sm w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-medium text-graphite">myproject/frontend</p>
                              <p className="text-xs text-steel-gray">Last push: 2 hours ago</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 bg-log-green rounded-full"></span>
                            <span className="text-xs text-log-green">Active</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                              <Github className="text-white text-sm w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-medium text-graphite">myproject/backend</p>
                              <p className="text-xs text-steel-gray">Last push: 5 hours ago</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 bg-log-green rounded-full"></span>
                            <span className="text-xs text-log-green">Active</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Notifications */}
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-graphite">Recent Notifications</h3>
                        <Button variant="link" className="text-sky-blue text-sm hover:underline">
                          View All
                        </Button>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 bg-sky-blue rounded-full flex items-center justify-center flex-shrink-0">
                            <SiSlack className="text-white text-sm" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-graphite">
                              <span className="font-medium">New push to frontend</span> - Fixed responsive layout issues in dashboard component
                            </p>
                            <p className="text-xs text-steel-gray">2 minutes ago</p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 bg-log-green rounded-full flex items-center justify-center flex-shrink-0">
                            <GitBranch className="text-white text-sm w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-graphite">
                              <span className="font-medium">Backend deployment</span> - Added new API endpoints for user management
                            </p>
                            <p className="text-xs text-steel-gray">15 minutes ago</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
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
                    className="w-full bg-sky-blue text-white py-3 rounded-lg hover:bg-blue-600 transition-colors mt-6 font-semibold"
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

      <Footer />
    </div>
  );
}
