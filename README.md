# PushLog

A SaaS platform that connects GitHub and Slack to automatically send intelligent code push notifications with custom branding.

![PushLog Logo](./attached_assets/PushLog.png)

## Features

- **GitHub Integration**: Connect repositories and automatically detect code pushes
- **Slack Notifications**: Send formatted push summaries to designated Slack channels
- **AI-Powered Summaries**: Generate intelligent code change summaries
- **Dashboard Management**: Monitor integrations and repository activity
- **Custom Branding**: Clean green and blue color scheme with wood log theme

## Color Scheme

- **Primary (Log Green)**: #4CAF50
- **Background**: White #FFFFFF
- **Text**: Graphite #333333
- **Accent**: Sky Blue #00BFFF or Steel Gray #9E9E9E

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, TypeScript
- **UI Components**: Radix UI, shadcn/ui
- **Data Management**: In-memory storage with TypeScript interfaces
- **Integrations**: GitHub API, Slack Web API

## Getting Started

### Prerequisites

- Node.js 20+
- Slack Bot Token
- GitHub OAuth App credentials (optional for full functionality)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/pushlog.git
cd pushlog
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Required for Slack integration
SLACK_BOT_TOKEN=your_slack_bot_token
SLACK_CHANNEL_ID=your_default_channel_id

# Optional for GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

4. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## Configuration

### Slack Setup

1. Create a Slack app at https://api.slack.com/apps
2. Add the following OAuth scopes:
   - `chat:write`
   - `channels:read`
   - `groups:read`
3. Install the app to your workspace
4. Copy the Bot User OAuth Token to your environment variables

### GitHub Setup (Optional)

1. Create a GitHub OAuth App in your GitHub settings
2. Set the authorization callback URL to your domain + `/auth/github/callback`
3. Copy the Client ID and Client Secret to your environment variables

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/        # Application pages
│   │   ├── lib/          # Utilities and types
│   │   └── App.tsx       # Main application component
├── server/                # Backend Express application
│   ├── routes.ts         # API route handlers
│   ├── storage.ts        # In-memory data storage
│   ├── slack.ts          # Slack integration
│   └── github.ts         # GitHub integration
├── shared/               # Shared TypeScript schemas
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

## Deployment

The application is designed to run on platforms like Replit, Vercel, or any Node.js hosting service.

### Environment Variables for Production

```bash
NODE_ENV=production
SLACK_BOT_TOKEN=your_production_slack_token
SLACK_CHANNEL_ID=your_production_channel_id
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this for your own projects.

## Support

For issues and questions, please open a GitHub issue or contact the development team.