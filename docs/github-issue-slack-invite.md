# GitHub Issue: Users must run "/invite @PushLog" in Slack before receiving messages

**Copy the content below into a new GitHub issue** (e.g. https://github.com/carterjohndixon/PushLog/issues/new).

---

## Title

**Users must run "/invite @PushLog" in Slack before receiving messages**

---

## Body

### Problem

When users connect a Slack channel to PushLog and confirm the integration, they don't receive messages until someone has run `/invite @PushLog` in that Slack channel. The Slack API returns `not_in_channel` when the app isn't in the channel, so the welcome message (and later push notifications) fail.

Currently:

- The **welcome message** sent on integration creation often fails silently (caught in `server/routes.ts` around line 1804).
- Users only discover the issue when they get a **"Slack delivery failed"** notification, which tells them to "invite the app to the channel (/invite @PushLog) if needed."
- This is a poor first-run experience and leads to confusion.

### Proposed fix

**Option A – Notify at confirmation time (simplest)**  
When the user confirms the integration:

- If sending the welcome message fails with `not_in_channel` (or we detect the bot isn't in the channel), show a clear **in-app notification** and/or **success-step message** telling the user:  
  **"Invite PushLog to the channel in Slack: type `/invite @PushLog` in #channel-name."**
- Optionally, still send a DM or in-channel ephemeral message in Slack with the same instruction (if we have a way to reach the user in Slack).

**Option B – Auto-join when possible (better UX)**  
- For **public channels**: When the user confirms the integration, call Slack's `conversations.join` (with scope `channels:join`) so the PushLog app joins the channel automatically. Then send the welcome message.
- For **private channels**: Slack does not allow bots to join private channels via API; the user must invite the app. So when the selected channel is private (or `conversations.join` fails), fall back to **Option A**: show an in-app (and optionally in-Slack) notification with the exact step: `/invite @PushLog` in that channel.

Implementing **Option B** with fallback to **Option A** for private channels would give the best experience: no manual step for public channels, and a clear, immediate instruction when the channel is private.
