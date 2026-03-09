<div align="center">

<img src="https://raw.githubusercontent.com/pushlog-ai/PushLog/main/attached_assets/PushLog.png" alt="PushLog" width="120" />

# PushLog

### *Intelligent code push notifications — GitHub, Slack, and AI in one place.*

[![Website](https://img.shields.io/badge/🌐_pushlog.ai-Live-success?style=for-the-badge)](https://pushlog.ai)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](https://github.com/pushlog-ai/.github/blob/main/profile/LICENSE)

**Stop wondering what shipped. Start *seeing* it.**

</div>

---

## 🎯 What is PushLog?

**PushLog** is a web-based SaaS platform that turns every code push into a clear, AI-summarized update in Slack. Connect your GitHub repos and Slack channels once — then get smart notifications automatically. Add **Sentry** and you get error spikes, regressions, and deploy-related incidents in the same place. No scripts to run, no servers to host. Just [pushlog.ai](https://pushlog.ai) in your browser.

> 💡 **TL;DR:** Push code → PushLog summarizes it with AI → Your team gets a readable Slack message. Optional: Sentry incidents show up there too.

---

## ✨ Features at a glance

| | Feature | Description |
|:--:|:--|:--|
| 🤖 | **AI-powered summaries** | AI summaries of your commits — what changed and why it matters |
| 🔗 | **GitHub integration** | Connect repositories; push events are detected via webhooks |
| 💬 | **Slack notifications** | Formatted push summaries and incident alerts in your chosen channels |
| 🚨 | **Incident alerts (Sentry)** | Error spikes, regressions, and deploy alerts surface as PushLog incidents |
| 📡 | **pushlog-agent** | Optional Go binary for servers: stream runtime errors to PushLog without Sentry |
| 🌐 | **100% web-based** | No install, no CLI — use it from any browser |
| 👤 | **Solo or team** | Use it for yourself or invite your whole organization |
| 🔀 | **Branch filtering** | Notify on main-only, all branches, or tagged releases |
| 📊 | **Dashboard** | Monitor integrations, repos, and activity in one clean UI |
| 💳 | **Credit system** | Pay-as-you-go AI credits (Starter, Professional, Enterprise packs) |
| 🎨 | **Clean UI** | Log green & sky blue theme; wood-inspired branding |

---

## 🚀 How to get started

1. **Visit** → [pushlog.ai](https://pushlog.ai)
2. **Sign up** → Email or GitHub
3. **Connect GitHub** → Authorize PushLog to see your repos
4. **Connect Slack** → Pick the workspace and channel for notifications
5. **Create an integration** → Link a repo to a Slack channel
6. **Configure** → Choose AI model, branch rules, and notification preferences
7. **Power AI summaries** → Either **purchase credits** from PushLog or **add your own API key** (OpenAI or OpenRouter) in settings
8. **Push code** → Notifications start flowing automatically 🎉

---

## 🚨 Incident alerts (Sentry)

PushLog can receive events from **Sentry** and show them as incident notifications alongside your push activity.

- **Quick setup:** Create a Sentry Internal Integration with webhook URL  
  `https://pushlog.ai/api/webhooks/sentry`  
  Add an Alert Rule, and you’re done.
- **Full guide:** [Sentry Setup →](https://github.com/pushlog-ai/PushLog/blob/main/docs/SENTRY_SETUP.md)

---

## 📡 Server agent (pushlog-agent)

Besides Sentry, you can stream **runtime errors** from your own servers using **pushlog-agent**: a small Go binary that runs on Linux, watches log files or stderr, and sends events to PushLog. Create an agent in **Settings → Agents**, get a token, then install and run the agent on your hosts.

- **Docs:** [PushLog Agent (Go) →](https://github.com/pushlog-ai/PushLog/blob/main/docs/PUSHLOG_AGENT_GO.md) — install, config, systemd, and usage
- **Where:** Agent code lives in the [`agent/`](https://github.com/pushlog-ai/PushLog/tree/main/agent) directory in this repo

---

## 💰 Pricing (credit packs)

| Pack | Price | Credits |
|:-----|:-----:|--------:|
| 🟢 **Starter** | $5 | 1,000 |
| 🔵 **Professional** | $20 | 5,000 |
| 🟣 **Enterprise** | $50 | 15,000 |

Credits are used when AI generates push summaries. Different models use different amounts per summary (e.g. ~15–30 credits depending on model).

---

## 🛠️ Tech stack

| Layer | Tech |
|:-----|:-----|
| **Frontend** | React, TypeScript, Tailwind CSS, Vite, Radix UI / shadcn |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | Supabase |
| **Auth** | Cookies, email verification |
| **AI** | OpenAI API or OpenRouter API |
| **Payments** | Stripe |
| **Integrations** | GitHub API, Slack Web API |

---

## 📚 Quick links

| | Link |
|:--|:--|
| 🌐 | **Use PushLog** → [pushlog.ai](https://pushlog.ai) |
| 📂 | **This repository** → [pushlog-ai/PushLog](https://github.com/pushlog-ai/PushLog) |
| 📄 | **License** → [MIT (profile)](https://github.com/pushlog-ai/.github/blob/main/profile/LICENSE) |
| 📖 | **Sentry setup** → [docs/SENTRY_SETUP.md](https://github.com/pushlog-ai/PushLog/blob/main/docs/SENTRY_SETUP.md) |
| 📡 | **pushlog-agent** → [docs/PUSHLOG_AGENT_GO.md](https://github.com/pushlog-ai/PushLog/blob/main/docs/PUSHLOG_AGENT_GO.md) |
| 🔒 | **Privacy** → We only use what’s needed for summaries; we don’t store your code |

---

<div align="center">

*So your team sees **what shipped**, not just that something changed.*

**PushLog** — 🪵 Log your pushes.

</div>
