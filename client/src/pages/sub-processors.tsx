import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Database, Key, CreditCard, Mail, AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function SubProcessors() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Sub-Processor Guidelines</h1>
          <p className="text-muted-foreground text-lg">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="space-y-6">
          {/* Overview */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Shield className="w-5 h-5 text-sky-blue" />
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>
                PushLog uses third-party service providers (sub-processors) to deliver the Service. This page 
                outlines how I manage sub-processors and what data is shared with each provider.
              </p>
              <p>
                All sub-processors are carefully selected based on their security practices, compliance certifications, 
                and ability to protect your data. I only share data necessary to provide the functionality you've requested.
              </p>
            </CardContent>
          </Card>

          {/* Current Sub-Processors */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Database className="w-5 h-5 text-log-green" />
                Current Sub-Processors
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Supabase */}
              <div className="border-b border-border pb-4">
                <h3 className="font-semibold text-foreground mb-2">Supabase (PostgreSQL Database)</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Purpose:</strong> Hosts and manages the PostgreSQL database that stores all user data
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Data Shared:</strong> All user account data, repositories, integrations, push events, 
                  notifications, OAuth tokens (encrypted), and AI usage records
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Location:</strong> Cloud infrastructure (region may vary)
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Security:</strong> Data encrypted at rest and in transit, SOC 2 compliant
                </p>
                <a 
                  href="https://supabase.com/privacy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View Supabase Privacy Policy →
                </a>
              </div>

              {/* GitHub */}
              <div className="border-b border-border pb-4">
                <h3 className="font-semibold text-foreground mb-2">GitHub</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Purpose:</strong> Repository access via OAuth API to monitor push events and create webhooks
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Data Shared:</strong> OAuth access tokens (stored encrypted), repository metadata, 
                  commit information, and webhook payloads
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Location:</strong> United States
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Security:</strong> OAuth 2.0 authentication, encrypted API communications
                </p>
                <a 
                  href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View GitHub Privacy Statement →
                </a>
              </div>

              {/* Slack */}
              <div className="border-b border-border pb-4">
                <h3 className="font-semibold text-foreground mb-2">Slack</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Purpose:</strong> Send push notifications to Slack channels via OAuth API
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Data Shared:</strong> OAuth access tokens (stored encrypted), workspace information, 
                  channel IDs, and notification messages
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Location:</strong> United States
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Security:</strong> OAuth 2.0 authentication, encrypted API communications
                </p>
                <a 
                  href="https://slack.com/privacy-policy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View Slack Privacy Policy →
                </a>
              </div>

              {/* OpenAI */}
              <div className="border-b border-border pb-4">
                <h3 className="font-semibold text-foreground mb-2">OpenAI</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Purpose:</strong> Generate AI-powered summaries of code changes
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Data Shared:</strong> Commit messages, file change metadata (file paths, additions/deletions), 
                  and code statistics. <strong>File contents are NOT sent.</strong>
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Location:</strong> United States
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Security:</strong> API key authentication, encrypted API communications, data retention policies
                </p>
                <a 
                  href="https://openai.com/policies/privacy-policy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View OpenAI Privacy Policy →
                </a>
              </div>

              {/* Stripe */}
              <div className="border-b border-border pb-4">
                <h3 className="font-semibold text-foreground mb-2">Stripe</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Purpose:</strong> Process payments for AI credit purchases
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Data Shared:</strong> Transaction metadata (amount, credits purchased, status), Stripe customer ID. 
                  Credit card information is handled entirely by Stripe and never stored by PushLog.
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Location:</strong> United States
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Security:</strong> PCI DSS Level 1 compliant, encrypted payment processing
                </p>
                <a 
                  href="https://stripe.com/privacy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View Stripe Privacy Policy →
                </a>
              </div>

              {/* Email Service Provider */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Email Service Provider</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Purpose:</strong> Send verification emails, password reset emails, and service notifications
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Data Shared:</strong> Email addresses for delivery purposes only
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Location:</strong> Cloud infrastructure
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Security:</strong> Encrypted email delivery, SPF/DKIM authentication
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Sub-Processor Management */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Key className="w-5 h-5 text-sky-blue" />
                Sub-Processor Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>
                I carefully evaluate all sub-processors before engaging their services and regularly review their 
                security practices and compliance certifications.
              </p>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Selection Criteria:</h3>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                  <li>Strong security practices and compliance certifications (SOC 2, ISO 27001, etc.)</li>
                  <li>Clear privacy policies and data processing agreements</li>
                  <li>Ability to meet GDPR and other data protection requirements</li>
                  <li>Proven track record of data security and reliability</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Notification of Changes:</h3>
                <p className="text-sm">
                  If I add or change sub-processors in a way that materially affects your data, I will update 
                  this page and notify you via email at least 30 days before the change takes effect.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Protection */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Shield className="w-5 h-5 text-log-green" />
                Data Protection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>
                All sub-processors are contractually required to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Process your data only as necessary to provide the Service</li>
                <li>Implement appropriate technical and organizational security measures</li>
                <li>Comply with applicable data protection laws (GDPR, CCPA, etc.)</li>
                <li>Not use your data for any purpose other than providing services to PushLog</li>
                <li>Notify me of any data breaches affecting your data</li>
              </ul>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Questions About Sub-Processors?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>
                If you have questions about how your data is handled by sub-processors, please contact me:
              </p>
              <p>
                <strong>Email:</strong>{" "}
                <a href="mailto:carter@pushlog.ai" className="text-primary hover:underline">
                  carter@pushlog.ai
                </a>
              </p>
              <p className="mt-4">
                See also: <Link href="/policy" className="text-primary hover:underline">Privacy Policy</Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
