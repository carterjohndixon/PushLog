import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Github, MessageCircle, FileText } from "lucide-react";
import { Link } from "wouter";

export default function Support() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12 max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">Support</h1>
          <p className="text-muted-foreground text-lg">
            Need help with PushLog? Here's how to get in touch.
          </p>
        </div>

        <div className="space-y-6">
          {/* Contact */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Mail className="w-5 h-5 text-log-green dark:text-emerald-400" />
                Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>
                For questions, bug reports, or feature requests, please reach out:
              </p>
              <div className="bg-muted rounded-lg p-4">
                <p className="font-medium text-foreground">Email</p>
                <a 
                  href="mailto:carter@pushlog.ai" 
                  className="text-primary hover:underline"
                >
                  carter@pushlog.ai
                </a>
              </div>
            </CardContent>
          </Card>

          {/* GitHub Issues */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Github className="w-5 h-5 text-foreground" />
                Report an Issue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>
                Found a bug or have a feature request? Open an issue on GitHub:
              </p>
              <a 
                href="https://github.com/carterjohndixon/PushLog/issues" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
              >
                <Github className="w-4 h-4" />
                Open GitHub Issues
              </a>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <MessageCircle className="w-5 h-5 text-primary" />
                Common Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">How do I connect my GitHub account?</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Click "Login with GitHub" on the login page, or go to your dashboard and click "Connect GitHub" to link your account.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">How do I connect a Slack workspace?</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Go to Integrations, click "Add Integration", and follow the prompts to connect your Slack workspace.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Why aren't my private repos showing?</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Make sure you've granted the "repo" scope when connecting GitHub. You may need to disconnect and reconnect with the correct permissions.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">How do I delete my account?</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Go to Settings → Danger Zone → Delete Account. This will permanently remove all your data.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">How do I connect Sentry for incident alerts?</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Go to Integrations → expand &quot;Incident Alerts (Sentry)&quot; for the webhook URL and steps. Full guide:{" "}
                  <a
                    href="https://github.com/carterjohndixon/PushLog/blob/main/docs/SENTRY_SETUP.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    docs/SENTRY_SETUP.md
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Links */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <FileText className="w-5 h-5 text-muted-foreground" />
                Resources
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <Link href="/policy" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>
                  {" "}— Learn how your data is handled
                </li>
                <li>
                  <Link href="/settings" className="text-primary hover:underline">
                    Account Settings
                  </Link>
                  {" "}— Manage your account and data
                </li>
                <li>
                  <a 
                    href="https://github.com/carterjohndixon/PushLog" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    GitHub Repository
                  </a>
                  {" "}— View the source code
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
