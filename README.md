# PushLog

A web-based platform that connects your GitHub and Slack accounts to automatically send code push notifications with AI-powered summaries.

![PushLog Logo](./attached_assets/PushLog.png)

## What is PushLog?

PushLog is a **web application** you use directly in your browser at [pushlog.ai](https://pushlog.ai). Connect your GitHub and Slack accounts, pick a repository and a channel, and PushLog will post a summary to Slack every time you push code.

## Features

- **🌐 Web-Based**: Access directly from your browser, no installation required
- **🔗 GitHub Integration**: Connect your repositories and automatically detect code pushes
- **💬 Slack Notifications**: Send formatted push summaries to your chosen Slack channels
- **🤖 AI-Powered Summaries**: Generate readable summaries of your code changes
- **📊 Dashboard**: Monitor your integrations and repository activity in one place
- **🔀 Branch Filtering**: Choose which pushes trigger notifications (main only, all branches, or tagged releases)

## How It Works

1. **Sign Up**: Create an account with your email or GitHub account
2. **Connect Accounts**: Link GitHub and Slack through OAuth
3. **Create an Integration**: Select a repository and the Slack channel to post to
4. **Configure Settings**: Choose your AI model and notification level
5. **Push Code**: When you push, PushLog:
   - Detects the push via a GitHub webhook
   - Generates an AI summary of the changes
   - Sends a formatted notification to your Slack channel

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, TypeScript
- **Database**: Supabase
- **UI Components**: Radix UI, shadcn/ui
- **Authentication**: JWT tokens with email verification
- **AI Integration**: OpenAI API
- **Integrations**: GitHub API, Slack Web API

## Privacy

PushLog only accesses the information needed to generate summaries and never stores your actual code content.
