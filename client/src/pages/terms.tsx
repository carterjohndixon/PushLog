import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Shield, AlertTriangle, Scale, Ban, RefreshCw } from "lucide-react";
import { Link } from "wouter";

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-graphite mb-4">Terms of Service</h1>
          <p className="text-steel-gray text-lg">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="space-y-6">
          {/* Introduction */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-blue" />
                Introduction
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                Welcome to PushLog. By accessing or using PushLog ("the Service"), you agree to be bound by these 
                Terms of Service ("Terms"). PushLog is a personal project created and operated by Carter Dixon.
              </p>
              <p>
                Please read these Terms carefully before using the Service. If you do not agree to these Terms, 
                you may not use the Service.
              </p>
            </CardContent>
          </Card>

          {/* Description of Service */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-log-green" />
                Description of Service
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                PushLog is a web-based service that connects your GitHub repositories with Slack workspaces to 
                provide automated push notifications with AI-powered code summaries. The Service includes:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>GitHub repository monitoring via webhooks</li>
                <li>Slack notifications for code push events</li>
                <li>AI-generated summaries of code changes (powered by OpenAI)</li>
                <li>Integration management dashboard</li>
              </ul>
            </CardContent>
          </Card>

          {/* Account Terms */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-sky-blue" />
                Account Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>You must be 13 years or older to use this Service.</li>
                <li>You must provide accurate and complete information when creating an account.</li>
                <li>You are responsible for maintaining the security of your account credentials.</li>
                <li>You are responsible for all activities that occur under your account.</li>
                <li>You must notify me immediately of any unauthorized use of your account.</li>
                <li>One person or entity may not maintain more than one free account.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Acceptable Use */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-500" />
                Acceptable Use
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>You agree NOT to use the Service to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Violate any laws or regulations</li>
                <li>Infringe on the intellectual property rights of others</li>
                <li>Transmit malicious code, spam, or harmful content</li>
                <li>Attempt to gain unauthorized access to the Service or its systems</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Abuse, harass, or threaten others</li>
                <li>Resell or redistribute the Service without permission</li>
              </ul>
              <p className="mt-4">
                I reserve the right to suspend or terminate accounts that violate these terms.
              </p>
            </CardContent>
          </Card>

          {/* Third-Party Services */}
          <Card>
            <CardHeader>
              <CardTitle>Third-Party Services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                The Service integrates with third-party services including GitHub, Slack, OpenAI, and Stripe. 
                Your use of these services is subject to their respective terms of service:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><a href="https://docs.github.com/en/site-policy/github-terms/github-terms-of-service" target="_blank" rel="noopener noreferrer" className="text-sky-blue hover:underline">GitHub Terms of Service</a></li>
                <li><a href="https://slack.com/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-sky-blue hover:underline">Slack Terms of Service</a></li>
                <li><a href="https://openai.com/policies/terms-of-use" target="_blank" rel="noopener noreferrer" className="text-sky-blue hover:underline">OpenAI Terms of Use</a></li>
                <li><a href="https://stripe.com/legal/consumer" target="_blank" rel="noopener noreferrer" className="text-sky-blue hover:underline">Stripe Services Agreement</a></li>
              </ul>
              <p className="mt-4">
                I am not responsible for the actions, content, or policies of these third-party services.
              </p>
            </CardContent>
          </Card>

          {/* Payment Terms */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Some features require purchasing AI credits.</li>
                <li>All payments are processed securely through Stripe.</li>
                <li>Prices are displayed in USD and may change with notice.</li>
                <li>AI credits are non-refundable once purchased.</li>
                <li>I do not store your credit card information.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Intellectual Property */}
          <Card>
            <CardHeader>
              <CardTitle>Intellectual Property</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                The Service and its original content, features, and functionality are owned by Carter Dixon 
                and are protected by international copyright, trademark, and other intellectual property laws.
              </p>
              <p>
                You retain ownership of any content you submit through the Service (such as repository configurations). 
                By using the Service, you grant me a limited license to process this content solely to provide the Service.
              </p>
            </CardContent>
          </Card>

          {/* Disclaimer of Warranties */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Disclaimer of Warranties
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p className="uppercase font-semibold text-graphite">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, 
                EITHER EXPRESS OR IMPLIED.
              </p>
              <p>
                I do not warrant that:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>The Service will be uninterrupted, secure, or error-free</li>
                <li>Results obtained from the Service will be accurate or reliable</li>
                <li>Any errors in the Service will be corrected</li>
              </ul>
              <p className="mt-4">
                You use the Service at your own risk. This is a personal project and not a commercial enterprise 
                with guaranteed uptime or support.
              </p>
            </CardContent>
          </Card>

          {/* Limitation of Liability */}
          <Card>
            <CardHeader>
              <CardTitle>Limitation of Liability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, CARTER DIXON SHALL NOT BE LIABLE FOR ANY INDIRECT, 
                INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Loss of profits, data, or business opportunities</li>
                <li>Service interruptions or downtime</li>
                <li>Unauthorized access to your data</li>
                <li>Any other damages arising from your use of the Service</li>
              </ul>
            </CardContent>
          </Card>

          {/* Termination */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-steel-gray" />
                Termination
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                I may terminate or suspend your account and access to the Service immediately, without prior 
                notice or liability, for any reason, including if you breach these Terms.
              </p>
              <p>
                You may terminate your account at any time by using the account deletion feature in Settings 
                or by contacting me. Upon termination, your right to use the Service will cease immediately.
              </p>
              <p>
                All provisions of these Terms which by their nature should survive termination shall survive, 
                including ownership provisions, warranty disclaimers, and limitations of liability.
              </p>
            </CardContent>
          </Card>

          {/* Changes to Terms */}
          <Card>
            <CardHeader>
              <CardTitle>Changes to Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                I reserve the right to modify or replace these Terms at any time. If a revision is material, 
                I will provide at least 30 days' notice prior to any new terms taking effect.
              </p>
              <p>
                By continuing to access or use the Service after revisions become effective, you agree to be 
                bound by the revised terms.
              </p>
            </CardContent>
          </Card>

          {/* Governing Law */}
          <Card>
            <CardHeader>
              <CardTitle>Governing Law</CardTitle>
            </CardHeader>
            <CardContent className="text-steel-gray">
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the United States, 
                without regard to its conflict of law provisions.
              </p>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-steel-gray">
              <p>
                If you have any questions about these Terms, please contact me:
              </p>
              <p>
                <strong>Email:</strong>{" "}
                <a href="mailto:carter@pushlog.ai" className="text-sky-blue hover:underline">
                  carter@pushlog.ai
                </a>
              </p>
              <p className="mt-4">
                See also: <Link href="/policy" className="text-sky-blue hover:underline">Privacy Policy</Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
