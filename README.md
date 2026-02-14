# PushLog

A web-based SaaS platform that connects your GitHub and Slack accounts to automatically send intelligent code push notifications with AI-powered summaries.

![PushLog Logo](./attached_assets/PushLog.png)

## What is PushLog?

PushLog is a **web application** that you can access directly in your browser. Simply visit the website, connect your GitHub and Slack accounts, and start receiving intelligent notifications about your code pushes automatically.

## Features

- **🚨 Incident Alerts**: Connect Sentry to get error/deploy incident reports in PushLog. See [Sentry Setup](docs/SENTRY_SETUP.md).
- **🌐 Web-Based**: Access directly from your browser - no installation required
- **🔗 GitHub Integration**: Connect your repositories and automatically detect code pushes
- **💬 Slack Notifications**: Send formatted push summaries to your designated Slack channels
- **🤖 AI-Powered Summaries**: Generate intelligent code change summaries using GPT models
- **📊 Dashboard Management**: Monitor integrations and repository activity from a clean dashboard
- **🎨 Custom Branding**: Clean green and blue color scheme with wood log theme
- **🔀 Branch Filtering**: Configurable notification levels (main-only, all branches, or tagged releases)
- **⚡ Real-time Testing**: Comprehensive webhook testing and validation tools
- **💳 Credit System**: Purchase AI credits to power your intelligent summaries

## Color Scheme

- **Primary (Log Green)**: #4CAF50
- **Background**: White #FFFFFF
- **Text**: Graphite #333333
- **Accent**: Sky Blue #00BFFF or Steel Gray #9E9E9E

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, TypeScript
- **Database**: Supabase
- **UI Components**: Radix UI, shadcn/ui
- **Authentication**: JWT tokens with email verification
- **AI Integration**: OpenAI API (GPT-3.5, GPT-4)
- **Payments**: Stripe for credit purchases
- **Integrations**: GitHub API, Slack Web API

## Getting Started

PushLog is a hosted web service - no installation or setup required!

## How to Use PushLog

1. **Visit the Website**: Go to [pushlog.ai](https://pushlog.ai)
2. **Create Account**: Sign up with your email or GitHub account
3. **Connect GitHub**: Authorize PushLog to access your repositories
4. **Connect Slack**: Authorize PushLog to send messages to your workspace
5. **Create Integration**: Select a repository and Slack channel to connect
6. **Configure Settings**: Choose your preferred AI model and notification settings
7. **Purchase Credits**: Buy AI credits to power intelligent summaries
8. **Start Coding**: PushLog will automatically send smart notifications to your Slack!

## How It Works

1. **Sign Up**: Users create an account and verify their email
2. **Connect Accounts**: Link GitHub and Slack accounts via OAuth
3. **Create Integration**: Select a repository and Slack channel to connect
4. **Configure Settings**: Choose AI model, notification level, and token limits
5. **Purchase Credits**: Buy AI credits to power intelligent summaries
6. **Automatic Notifications**: When you push code, PushLog:
   - Detects the push via GitHub webhooks
   - Generates an AI-powered summary of the changes
   - Sends a formatted notification to your Slack channel
   - Deducts credits based on AI usage

## Incident Alerts (Sentry)

PushLog can receive error events from Sentry and surface them as incident notifications. When you push code or Sentry detects a spike/regression, PushLog will alert you.

**Quick setup:** Create a Sentry Internal Integration with Webhook URL `https://pushlog.ai/api/webhooks/sentry`, add an Alert Rule, and you're done. Full instructions: [docs/SENTRY_SETUP.md](docs/SENTRY_SETUP.md)

## Pricing

PushLog uses a credit-based system for AI-powered summaries:

- **Starter Pack**: $5.00 for 1,000 credits
- **Professional Pack**: $20.00 for 5,000 credits  
- **Enterprise Pack**: $50.00 for 15,000 credits

Credits are used when AI generates summaries of your code pushes. Different AI models use different amounts of credits (roughly 350 tokens per summary):
- **GPT-5**: ~15 credits per summary (advanced model with enhanced capabilities)
- **GPT-5.1**: ~20 credits per summary (improved performance)
- **GPT-5.2**: ~25 credits per summary (latest model with cutting-edge features)
- **GPT-5.2-Codex**: ~30 credits per summary (specialized for code analysis)

## Privacy

Your code and data are secure. PushLog only accesses the information necessary to provide intelligent summaries and never stores your actual code content.
