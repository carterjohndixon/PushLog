import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock, Database, Eye, Trash2, Mail, Key } from "lucide-react";

export default function Policy() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Privacy Policy & Data Processing</h1>
          <p className="text-muted-foreground text-lg">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="space-y-6">
          {/* Overview */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Eye className="w-5 h-5 text-primary" />
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
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
          <Card className="border-border bg-card">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                <Database className="w-5 h-5 text-log-green" />
                Data I Collect
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Account Information</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                  <li>Username and email address</li>
                  <li>Password (stored as bcrypt hash, never in plaintext)</li>
                  <li>Email verification status</li>
                  <li>Account creation date</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">OAuth Integration Data</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                  <li><strong>GitHub:</strong> OAuth access tokens, GitHub user ID, repository information (name, owner, branch, webhook IDs)</li>
                  <li><strong>Slack:</strong> OAuth access tokens, workspace IDs, team names, channel IDs and names</li>
                  <li><strong>Google:</strong> OAuth access tokens and Google user ID (if used for authentication)</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-2 italic">
                  ⚠️ <strong>Note:</strong> OAuth tokens are stored in my database to enable API access. These tokens are encrypted at rest by my database provider (Supabase).
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Repository & Integration Data</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                  <li>Connected GitHub repositories (name, owner, branch, webhook configuration)</li>
                  <li>Slack workspace and channel connections</li>
                  <li>Notification preferences (branch filtering, commit summary settings)</li>
                  <li>AI model preferences and token limits</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Push Event Data</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                  <li>Commit messages, commit SHA, branch names</li>
                  <li>Author information (name from Git commits)</li>
                  <li>Files changed (file paths only, not file contents)</li>
                  <li>Code statistics (additions/deletions)</li>
                  <li>AI-generated summaries of code changes</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-2 italic">
                  ⚠️ <strong>Important:</strong> Commit messages and file change metadata are sent to OpenAI for AI summary generation. 
                  File contents are NOT sent to OpenAI, only metadata (file paths, commit messages, statistics).
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Payment Information</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                  <li>Stripe customer ID (stored in our database)</li>
                  <li>Payment transaction records (amount, credits purchased, status)</li>
                  <li>AI credit balance and usage</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Note:</strong> I do NOT store credit card numbers or payment details. All payment processing is handled 
                  securely by Stripe. I only store transaction metadata.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Usage & Analytics</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                  <li>AI usage tracking (tokens used, model used, cost per request)</li>
                  <li>In-app notifications and activity logs</li>
                  <li>Integration status and activity</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* How We Use Data */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Eye className="w-5 h-5 text-primary" />
                How I Use Your Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
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
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Key className="w-5 h-5 text-log-green" />
                Third-Party Services & Data Sharing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Service Providers</h3>
                <ul className="space-y-3 text-muted-foreground">
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

              <div className="bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>⚠️ Important:</strong> I do NOT sell your personal data to third parties. I only share data with 
                  the service providers listed above as necessary to provide my service.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Security */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Shield className="w-5 h-5 text-log-green" />
                Data Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Password Security:</strong> Passwords are hashed using bcrypt before storage. I never store plaintext passwords.</li>
                <li><strong>Encryption:</strong> Data is encrypted in transit (HTTPS/TLS) and at rest (database encryption by Supabase).</li>
                <li><strong>Authentication:</strong> I use JWT tokens for session management. Tokens expire and are validated on each request.</li>
                <li><strong>OAuth Tokens:</strong> Stored securely in my database. Access is restricted to authenticated API requests only.</li>
                <li><strong>Email Verification:</strong> Required before accessing certain features to prevent unauthorized access.</li>
              </ul>
              
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-md p-4 mt-4">
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>⚠️ Security Concern:</strong> OAuth tokens (GitHub, Slack, Google) are currently stored in plaintext in my database. 
                  While the database is encrypted at rest, I recommend encrypting these tokens with application-level encryption for additional security.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Retention */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Trash2 className="w-5 h-5 text-muted-foreground" />
                Data Retention & Deletion Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>
                This policy outlines how long I retain your data and when it is automatically deleted or can be deleted upon request.
              </p>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Active Account Data Retention</h3>
                <p className="text-sm mb-2">
                  While your account is active, I retain all data necessary to provide the Service:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                  <li><strong>Account Information:</strong> Retained indefinitely while your account is active</li>
                  <li><strong>OAuth Tokens:</strong> Retained until you disconnect the service or delete your account</li>
                  <li><strong>Repository Data:</strong> Retained until you remove the repository or delete your account</li>
                  <li><strong>Integration Settings:</strong> Retained until you delete the integration or account</li>
                  <li><strong>Push Event History:</strong> Retained indefinitely to provide historical notifications and analytics</li>
                  <li><strong>AI Usage Records:</strong> Retained for billing and usage tracking purposes</li>
                  <li><strong>Notifications:</strong> Retained until you delete them or delete your account</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Inactive Account Data Retention</h3>
                <p className="text-sm mb-2">
                  If your account becomes inactive (no login activity for 2 years), I will:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                  <li>Send email notifications before account deletion</li>
                  <li>Retain data for 90 days after the final notification</li>
                  <li>Automatically delete the account and all associated data after the retention period</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Account Deletion</h3>
                <p className="text-sm mb-2">
                  When you delete your account, the following data is permanently removed:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                  <li>User account and profile information</li>
                  <li>All connected repositories and webhook configurations</li>
                  <li>All integrations and Slack workspace connections</li>
                  <li>All push event history and commit data</li>
                  <li>All notifications and activity logs</li>
                  <li>OAuth tokens and authentication data</li>
                  <li>AI usage records</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Data Retained After Account Deletion</h3>
                <p className="text-sm mb-2">
                  The following data may be retained for legal, accounting, or security purposes:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                  <li><strong>Payment Records:</strong> Retained for 7 years as required by accounting and tax laws</li>
                  <li><strong>Transaction Metadata:</strong> Retained for fraud prevention and dispute resolution</li>
                  <li><strong>Security Logs:</strong> Retained for 1 year for security and abuse prevention</li>
                </ul>
                <p className="text-sm mt-2 italic">
                  This retained data is anonymized and cannot be linked to your personal account.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Automatic Data Cleanup</h3>
                <p className="text-sm mb-2">
                  I automatically clean up certain data to maintain system performance:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                  <li><strong>Expired Verification Tokens:</strong> Deleted 7 days after expiration</li>
                  <li><strong>Expired Password Reset Tokens:</strong> Deleted 24 hours after expiration</li>
                  <li><strong>Old Notifications:</strong> Notifications older than 1 year may be automatically archived</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Requesting Data Deletion</h3>
                <p className="text-sm mb-2">
                  You can request deletion of your data at any time:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                  <li><strong>Full Account Deletion:</strong> Use the "Delete Account" feature in Settings, or contact me directly</li>
                  <li><strong>Partial Deletion:</strong> Delete individual repositories or integrations from your dashboard</li>
                  <li><strong>OAuth Disconnection:</strong> Revoke access in your GitHub/Slack/Google account settings</li>
                </ul>
                <p className="text-sm mt-2">
                  I will process deletion requests within 30 days. You will receive confirmation once your data has been deleted.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-md p-4 mt-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>💡 Note:</strong> Deleted data cannot be recovered. Please export your data before deletion if you want to keep a copy. 
                  You can export all your data from the Settings page.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Your Rights */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Lock className="w-5 h-5 text-primary" />
                Your Rights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
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
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Eye className="w-5 h-5 text-muted-foreground" />
                Cookies & Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
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
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Children's Privacy</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              <p>
                PushLog is not intended for users under the age of 13. I do not knowingly collect personal information 
                from children under 13. If you believe I have collected information from a child under 13, please contact me 
                immediately.
              </p>
            </CardContent>
          </Card>

          {/* Changes to Policy */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Changes to This Policy</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              <p>
                I may update this privacy policy from time to time. I will notify you of any material changes by posting 
                the new policy on this page and updating the "Last updated" date. I encourage you to review this policy periodically.
              </p>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Mail className="w-5 h-5 text-log-green" />
                Contact Us
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              <p>
                If you have questions about this privacy policy or wish to exercise your rights, please contact me:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> contact@pushlog.ai
              </p>
              <p>
                <strong>Website:</strong> <a href="https://pushlog.ai" className="text-primary hover:underline">pushlog.ai</a>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
