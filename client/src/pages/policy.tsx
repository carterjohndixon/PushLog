import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock, Database, Eye, Trash2, Mail, Key } from "lucide-react";

export default function Policy() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-graphite mb-4">Privacy Policy & Data Processing</h1>
          <p className="text-steel-gray text-lg">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="space-y-6">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-sky-blue" />
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
              PushLog is a personal project created and operated by Carter Dixon. This policy explains how I collect, 
              use, store, and protect your personal information when you use the service.
              </p>
              <p>
                PushLog is a web-based SaaS platform that connects your GitHub and Slack accounts to automatically send 
                intelligent code push notifications with AI-powered summaries.
              </p>
            </CardContent>
          </Card>

          {/* Data We Collect */}
          <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-log-green" />
                Data I Collect
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-graphite mb-2">Account Information</h3>
                <ul className="list-disc list-inside space-y-1 text-steel-gray ml-4">
                  <li>Username and email address</li>
                  <li>Password (stored as bcrypt hash, never in plaintext)</li>
                  <li>Email verification status</li>
                  <li>Account creation date</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-graphite mb-2">OAuth Integration Data</h3>
                <ul className="list-disc list-inside space-y-1 text-steel-gray ml-4">
                  <li><strong>GitHub:</strong> OAuth access tokens, GitHub user ID, repository information (name, owner, branch, webhook IDs)</li>
                  <li><strong>Slack:</strong> OAuth access tokens, workspace IDs, team names, channel IDs and names</li>
                  <li><strong>Google:</strong> OAuth access tokens and Google user ID (if used for authentication)</li>
                </ul>
                <p className="text-sm text-steel-gray mt-2 italic">
                  ⚠️ <strong>Note:</strong> OAuth tokens are stored in my database to enable API access. These tokens are encrypted at rest by my database provider (Supabase).
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-graphite mb-2">Repository & Integration Data</h3>
                <ul className="list-disc list-inside space-y-1 text-steel-gray ml-4">
                  <li>Connected GitHub repositories (name, owner, branch, webhook configuration)</li>
                  <li>Slack workspace and channel connections</li>
                  <li>Notification preferences (branch filtering, commit summary settings)</li>
                  <li>AI model preferences and token limits</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-graphite mb-2">Push Event Data</h3>
                <ul className="list-disc list-inside space-y-1 text-steel-gray ml-4">
                  <li>Commit messages, commit SHA, branch names</li>
                  <li>Author information (name from Git commits)</li>
                  <li>Files changed (file paths only, not file contents)</li>
                  <li>Code statistics (additions/deletions)</li>
                  <li>AI-generated summaries of code changes</li>
                </ul>
                <p className="text-sm text-steel-gray mt-2 italic">
                  ⚠️ <strong>Important:</strong> Commit messages and file change metadata are sent to OpenAI for AI summary generation. 
                  File contents are NOT sent to OpenAI, only metadata (file paths, commit messages, statistics).
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-graphite mb-2">Payment Information</h3>
                <ul className="list-disc list-inside space-y-1 text-steel-gray ml-4">
                  <li>Stripe customer ID (stored in our database)</li>
                  <li>Payment transaction records (amount, credits purchased, status)</li>
                  <li>AI credit balance and usage</li>
                </ul>
                <p className="text-sm text-steel-gray mt-2">
                  <strong>Note:</strong> I do NOT store credit card numbers or payment details. All payment processing is handled 
                  securely by Stripe. I only store transaction metadata.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-graphite mb-2">Usage & Analytics</h3>
                <ul className="list-disc list-inside space-y-1 text-steel-gray ml-4">
                  <li>AI usage tracking (tokens used, model used, cost per request)</li>
                  <li>In-app notifications and activity logs</li>
                  <li>Integration status and activity</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* How We Use Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-sky-blue" />
                How I Use Your Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>To provide and maintain my service (GitHub webhook monitoring, Slack notifications)</li>
                <li>To authenticate and authorize access to your account</li>
                <li>To generate AI-powered summaries of your code changes using OpenAI</li>
                <li>To process payments and manage AI credit purchases</li>
                <li>To send you email notifications (verification, password resets, service updates)</li>
                <li>To improve my service and troubleshoot issues</li>
                <li>To comply with legal obligations</li>
              </ul>
            </CardContent>
          </Card>

          {/* Third-Party Services */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-log-green" />
                Third-Party Services & Data Sharing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-graphite mb-2">Service Providers</h3>
                <ul className="space-y-3 text-steel-gray">
                  <li>
                    <strong>Supabase (PostgreSQL Database):</strong> Stores all your data. Data is encrypted at rest and in transit. 
                    Located in cloud infrastructure (region may vary).
                  </li>
                  <li>
                    <strong>GitHub:</strong> I access your repositories via GitHub API using OAuth tokens you authorize. 
                    I create webhooks to monitor push events. I do not share your data with GitHub beyond what's necessary for API access.
                  </li>
                  <li>
                    <strong>Slack:</strong> I send notifications to your Slack channels using OAuth tokens you authorize. 
                    I access workspace and channel information. I do not share your data with Slack beyond what's necessary for API access.
                  </li>
                  <li>
                    <strong>OpenAI:</strong> I send commit messages, file change metadata, and code statistics to OpenAI's API 
                    to generate AI summaries. <strong>File contents are NOT sent.</strong> OpenAI's privacy policy applies to this data.
                  </li>
                  <li>
                    <strong>Stripe:</strong> Payment processing. I share transaction metadata with Stripe. Credit card information 
                    is handled entirely by Stripe and never stored by me.
                  </li>
                  <li>
                    <strong>Email Service Provider:</strong> I use an email service to send verification emails and password resets. 
                    Your email address is shared with this provider for delivery purposes only.
                  </li>
                </ul>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <p className="text-sm text-yellow-800">
                  <strong>⚠️ Important:</strong> I do NOT sell your personal data to third parties. I only share data with 
                  the service providers listed above as necessary to provide my service.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-log-green" />
                Data Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Password Security:</strong> Passwords are hashed using bcrypt before storage. I never store plaintext passwords.</li>
                <li><strong>Encryption:</strong> Data is encrypted in transit (HTTPS/TLS) and at rest (database encryption by Supabase).</li>
                <li><strong>Authentication:</strong> I use JWT tokens for session management. Tokens expire and are validated on each request.</li>
                <li><strong>OAuth Tokens:</strong> Stored securely in my database. Access is restricted to authenticated API requests only.</li>
                <li><strong>Email Verification:</strong> Required before accessing certain features to prevent unauthorized access.</li>
              </ul>
              
              <div className="bg-red-50 border border-red-200 rounded-md p-4 mt-4">
                <p className="text-sm text-red-800">
                  <strong>⚠️ Security Concern:</strong> OAuth tokens (GitHub, Slack, Google) are currently stored in plaintext in my database. 
                  While the database is encrypted at rest, I recommend encrypting these tokens with application-level encryption for additional security.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Retention */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-steel-gray" />
                Data Retention & Deletion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                I retain your data for as long as your account is active and for a reasonable period afterward to comply with legal obligations.
              </p>
              <div>
                <h3 className="font-semibold text-graphite mb-2">You Can Request Deletion Of:</h3>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Your account and all associated data</li>
                  <li>Specific repositories or integrations</li>
                  <li>Push event history</li>
                  <li>OAuth connections (by revoking access in GitHub/Slack/Google settings)</li>
                </ul>
              </div>
              <p className="text-sm">
                To request data deletion, contact me at the email address provided in the "Contact" section below. 
                I will process deletion requests within 30 days.
              </p>
              <p className="text-sm italic">
                <strong>Note:</strong> Some data may be retained for legal or accounting purposes (e.g., payment records) 
                even after account deletion, as required by law.
              </p>
            </CardContent>
          </Card>

          {/* Your Rights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-sky-blue" />
                Your Rights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>Depending on your location, you may have the following rights:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Correction:</strong> Update or correct inaccurate data</li>
                <li><strong>Deletion:</strong> Request deletion of your data</li>
                <li><strong>Portability:</strong> Request your data in a portable format</li>
                <li><strong>Objection:</strong> Object to certain processing activities</li>
                <li><strong>Withdrawal:</strong> Withdraw consent for OAuth integrations at any time</li>
              </ul>
              <p className="text-sm">
                To exercise these rights, contact me using the information below. I will respond within 30 days.
              </p>
            </CardContent>
          </Card>

          {/* Cookies & Tracking */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-steel-gray" />
                Cookies & Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                I use localStorage to store authentication tokens and user preferences. I do NOT use tracking cookies, 
                analytics cookies, or third-party advertising trackers.
              </p>
              <p>
                <strong>LocalStorage Usage:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>JWT authentication tokens (for session management)</li>
                <li>User ID (for API requests)</li>
                <li>No personal data is stored in cookies</li>
              </ul>
            </CardContent>
          </Card>

          {/* Children's Privacy */}
          <Card>
            <CardHeader>
              <CardTitle>Children's Privacy</CardTitle>
            </CardHeader>
            <CardContent className="text-steel-gray">
              <p>
                PushLog is not intended for users under the age of 13. I do not knowingly collect personal information 
                from children under 13. If you believe I have collected information from a child under 13, please contact me 
                immediately.
              </p>
            </CardContent>
          </Card>

          {/* Changes to Policy */}
          <Card>
            <CardHeader>
              <CardTitle>Changes to This Policy</CardTitle>
            </CardHeader>
            <CardContent className="text-steel-gray">
              <p>
                I may update this privacy policy from time to time. I will notify you of any material changes by posting 
                the new policy on this page and updating the "Last updated" date. I encourage you to review this policy periodically.
              </p>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-log-green" />
                Contact Us
              </CardTitle>
            </CardHeader>
            <CardContent className="text-steel-gray">
              <p>
                If you have questions about this privacy policy or wish to exercise your rights, please contact me:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> carter@pushlog.ai
              </p>
              <p>
                <strong>Website:</strong> <a href="https://pushlog.ai" className="text-sky-blue hover:underline">pushlog.ai</a>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
