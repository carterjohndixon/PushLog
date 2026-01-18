import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Github, MessageCircle, FileText } from "lucide-react";
import { Link } from "wouter";

export default function Support() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12 max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-graphite mb-4">Support</h1>
          <p className="text-steel-gray text-lg">
            Need help with PushLog? Here's how to get in touch.
          </p>
        </div>

        <div className="space-y-6">
          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-log-green" />
                Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                For questions, bug reports, or feature requests, please reach out:
              </p>
              <div className="bg-gray-100 rounded-lg p-4">
                <p className="font-medium text-graphite">Email</p>
                <a 
                  href="mailto:carter@m0nke.com" 
                  className="text-sky-blue hover:underline"
                >
                  carter@m0nke.com
                </a>
              </div>
            </CardContent>
          </Card>

          {/* GitHub Issues */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="w-5 h-5 text-graphite" />
                Report an Issue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                Found a bug or have a feature request? Open an issue on GitHub:
              </p>
              <a 
                href="https://github.com/carterjohndixon/PushLog/issues" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-graphite text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
              >
                <Github className="w-4 h-4" />
                Open GitHub Issues
              </a>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-sky-blue" />
                Common Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-graphite">How do I connect my GitHub account?</h3>
                <p className="text-steel-gray text-sm mt-1">
                  Click "Login with GitHub" on the login page, or go to your dashboard and click "Connect GitHub" to link your account.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-graphite">How do I connect a Slack workspace?</h3>
                <p className="text-steel-gray text-sm mt-1">
                  Go to Integrations, click "Add Integration", and follow the prompts to connect your Slack workspace.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-graphite">Why aren't my private repos showing?</h3>
                <p className="text-steel-gray text-sm mt-1">
                  Make sure you've granted the "repo" scope when connecting GitHub. You may need to disconnect and reconnect with the correct permissions.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-graphite">How do I delete my account?</h3>
                <p className="text-steel-gray text-sm mt-1">
                  Go to Settings → Danger Zone → Delete Account. This will permanently remove all your data.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Links */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-steel-gray" />
                Resources
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-steel-gray">
                <li>
                  <Link href="/policy" className="text-sky-blue hover:underline">
                    Privacy Policy
                  </Link>
                  {" "}— Learn how your data is handled
                </li>
                <li>
                  <Link href="/settings" className="text-sky-blue hover:underline">
                    Account Settings
                  </Link>
                  {" "}— Manage your account and data
                </li>
                <li>
                  <a 
                    href="https://github.com/carterjohndixon/PushLog" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sky-blue hover:underline"
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
