# PushLog

A web-based SaaS platform that connects your GitHub and Slack accounts to automatically send intelligent code push notifications with AI-powered summaries.

![PushLog Logo](./attached_assets/PushLog.png)

## What is PushLog?

PushLog is a **web application** that you can access directly in your browser. Simply visit the website, connect your GitHub and Slack accounts, and start receiving intelligent notifications about your code pushes automatically.

## Features

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
b
## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **UI Components**: Radix UI, shadcn/ui
- **Authentication**: JWT tokens with email verification
- **AI Integration**: OpenAI API (GPT-3.5, GPT-4)
- **Payments**: Stripe for credit purchases
- **Integrations**: GitHub API, Slack Web API

## Getting Started

PushLog is a hosted web service - no installation or setup required!

## How to Use PushLog

1. **Visit the Website**: Go to [PushLog.app](https://pushlog.ai)
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

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/        # Application pages (dashboard, integrations, etc.)
│   │   ├── lib/          # Utilities and types
│   │   └── App.tsx       # Main application component
├── server/                # Backend Express application
│   ├── routes.ts         # API route handlers
│   ├── database.ts       # Database operations with Drizzle ORM
│   ├── ai.ts            # OpenAI integration
│   ├── stripe.ts        # Payment processing
│   ├── slack.ts         # Slack integration
│   └── github.ts        # GitHub integration
├── shared/               # Shared TypeScript schemas
├── migrations/           # Database migration files
└── attached_assets/      # Brand assets and logos
```

## API Endpoints

- `POST /api/auth/github` - GitHub OAuth callback
- `GET /api/repositories` - Get user repositories
- `POST /api/repositories` - Connect a repository
- `GET /api/integrations` - Get user integrations
- `POST /api/integrations` - Create new integration
- `GET /api/slack/channels` - Get Slack channels
- `POST /api/webhooks/github` - GitHub webhook endpoint

## Pricing

PushLog uses a credit-based system for AI-powered summaries:

- **Starter Pack**: $5.00 for 1,000 credits
- **Professional Pack**: $20.00 for 5,000 credits  
- **Enterprise Pack**: $50.00 for 15,000 credits

Credits are used when AI generates summaries of your code pushes. Different AI models use different amounts of credits:
- **GPT-3.5 Turbo**: ~350 credits per summary
- **GPT-4**: ~1,000 credits per summary

## Privacy

Your code and data are secure. PushLog only accesses the information necessary to provide intelligent summaries and never stores your actual code content.
