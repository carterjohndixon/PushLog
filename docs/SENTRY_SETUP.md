# Connect Sentry for Incident Alerts

PushLog can receive error events from Sentry and surface them as **incident alerts** in your dashboard. When Sentry detects a spike, new issue, or regression, PushLog will notify you and correlate errors to recent deploys.

## What You Get

- **Incident notifications** in PushLog (bell icon) when Sentry fires an alert
- **Deploy correlation** — when you include commit/deploy info, PushLog ranks which commits likely caused the error
- **No duplicate setup** — works alongside your existing GitHub → Slack push flow

---

## Quick Setup (5 minutes)

### 1. Create a Sentry Internal Integration

1. Go to [Sentry](https://sentry.io) → **Settings** → **Developer Settings** → **Custom Integrations** (or **Internal Integrations**)
2. Click **Create New Integration**
3. Choose **Internal Integration** (not Public Integration — that's for publishing to the Sentry marketplace)
4. Fill in the form:
   - **Name:** e.g. "PushLog Incident Alerts"
   - **Webhook URL:**
   ```
   https://YOUR-PUSHLOG-DOMAIN.com/api/webhooks/sentry
   ```
   (Replace with your PushLog URL, e.g. `https://pushlog.ai` or `https://staging.pushlog.ai`)
   - **Alert Rule Action:** Enable (required)
   - **Webhooks:** Leave default; **Permissions:** Leave "No Access"
5. Copy the **Webhook Secret** (optional — for signature verification)
6. Click **Save Changes**

> You do *not* need to create an app or add the React SDK. The Internal Integration is enough.

### 2. Create an Alert Rule

1. Go to **Alerts** → **Create Alert**
2. On **Select Alert**, choose **Errors** → **Issues**
3. **WHEN:** e.g. "A new issue is created"
4. **THEN:** Select **Send a notification via [PushLog Incident Alerts]** — not "Send an email"
5. Click **Set Conditions**, finish, and save

> You need both the Integration and the Alert Rule.

### 3. Configure PushLog (optional)

If you set a **Webhook Secret** in Sentry, add it to your PushLog environment:

```bash
SENTRY_WEBHOOK_SECRET=your_webhook_secret_from_sentry
```

This ensures only Sentry can send events to your webhook.

---

## Webhook URL Reference

| Environment | Webhook URL |
|-------------|-------------|
| Production | `https://pushlog.ai/api/webhooks/sentry` |
| Staging | `https://staging.pushlog.ai/api/webhooks/sentry` |
| Self-hosted | `https://YOUR-DOMAIN/api/webhooks/sentry` |

The URL is also shown in-app under **Integrations** → **Incident Alerts (Sentry)**.

---

## What PushLog Receives

PushLog’s Sentry adapter accepts Sentry’s native webhook payload and transforms it into the incident engine format:

- **Exception type** from `exception.values[0].type`
- **Message** from `exception.values[0].value` or the event title
- **Stack trace** from exception frames (file path, function name)
- **Environment** from Sentry tags (e.g. `environment: production`)
- **Severity** from `level` (error → error, warning → warning, fatal → critical)
- **Link** to the Sentry event for quick debugging

---

## Deploy Correlation (Optional)

To correlate errors with recent deploys, include a **change window** when sending events. PushLog’s GitHub integrations do this automatically for push events. For Sentry-only setups, you’d need to:

1. Use a release/deploy tracking tool that POSTs to `/api/webhooks/incidents` with `change_window`
2. Or rely on the incident engine’s spike/regression detection (no deploy correlation)

---

## Troubleshooting

**No incidents showing up?**
- Confirm the Sentry alert rule fired (check Sentry’s Alert History)
- Verify the webhook URL and that PushLog is reachable from Sentry
- Check PushLog server logs for `[webhooks/sentry]` entries

**Wrong format errors?**
- PushLog expects Sentry’s **Issue Alert** webhook format. If using a custom integration, ensure it sends the standard `event_alert` payload.

**Need the generic webhook instead?**
- Use `POST /api/webhooks/incidents` with the [Incident Event schema](../server/incidentEngine.ts) — useful for Datadog, custom scripts, etc.

---

## Related

- [PushLog README](../README.md)
