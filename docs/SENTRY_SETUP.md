# Connect Sentry for Incident Alerts

PushLog can receive error events from Sentry and surface them as **incident alerts** in your dashboard. When Sentry detects a spike, new issue, or regression, PushLog will notify you and correlate errors to recent deploys.

**Client & server:** The React app uses `@sentry/react` (configured in `client/src/main.tsx`). Set `VITE_SENTRY_DSN` to override the default DSN or leave empty to disable client-side reporting. The Node server uses `SENTRY_DSN` (see `server/index.ts`).

## What You Get

- **Incident notifications** in PushLog (bell icon) when Sentry fires an alert
- **Deploy correlation** — when you include commit/deploy info, PushLog ranks which commits likely caused the error
- **No duplicate setup** — works alongside your existing GitHub → Slack push flow

---

## Quick Setup (5 minutes)

### 1. Create a webhook URL in PushLog

1. Go to **PushLog** → **Settings** → scroll to **Sentry webhooks**
2. Click **Add webhook**
3. Enter an **App name** (e.g. "Frontend", "Backend API") and optionally an **App URL** (for your reference)
4. Click **Create**
5. Copy the **Webhook URL** and **Secret** shown — they will not be shown again. Add both to Sentry in the next step.

Each app gets a unique URL (e.g. `https://pushlog.ai/api/webhooks/sentry/pls_xxx`). Create one app per Sentry project if you have multiple.

### 2. Create a Sentry Internal Integration

1. Go to [Sentry](https://sentry.io) → **Settings** → **Developer Settings** → **Custom Integrations** (or **Internal Integrations**)
2. Click **Create New Integration**
3. Choose **Internal Integration** (not Public Integration — that's for publishing to the Sentry marketplace)
4. Fill in the form:
   - **Name:** e.g. "PushLog Incident Alerts"
   - **Webhook URL:** Paste the URL from PushLog (e.g. `https://pushlog.ai/api/webhooks/sentry/pls_xxxxx`)
   - **Webhook Secret:** Paste the secret from PushLog (required for signature verification)
   - **Alert Rule Action:** Enable (required)
   - **Webhooks:** Leave default; **Permissions:** Leave "No Access"
5. Click **Save Changes**

> You do *not* need to create an app or add the React SDK. The Internal Integration is enough.

### 3. Create an Alert Rule

1. Go to **Alerts** → **Create Alert**
2. On **Select Alert**, choose **Errors** → **Issues**
3. **WHEN:** e.g. "A new issue is created"
4. **THEN:** Select **Send a notification via [PushLog Incident Alerts]** — not "Send an email"
5. Click **Set Conditions**, finish, and save

> You need both the Integration and the Alert Rule.

---

## Webhook URL Reference

Webhook URLs are **per-app** and unique to your organization. Create an app in **Settings → Sentry webhooks** to get your URL. Format:

```
https://pushlog.ai/api/webhooks/sentry/pls_xxxxxxxxxxxx
```

- **Production:** `https://pushlog.ai/api/webhooks/sentry/<your-token>`
- **Staging:** `https://staging.pushlog.ai/api/webhooks/sentry/<your-token>`
- **Self-hosted:** `https://YOUR-DOMAIN/api/webhooks/sentry/<your-token>`

---

## What PushLog Receives

PushLog's Sentry adapter accepts Sentry's native webhook payload and transforms it into the incident engine format:

- **Exception type** from `exception.values[0].type`
- **Message** from `exception.values[0].value` or the event title
- **Stack trace** from exception frames (file path, function name)
- **Environment** from Sentry tags (e.g. `environment: production`)
- **Severity** from `level` (error → error, warning → warning, fatal → critical)
- **Link** to the Sentry event for quick debugging

---

## Stack traces: bundled vs original source

**PushLog server (your app):** When an error happens in the PushLog Node server, the stack points at the bundled `index.js`. PushLog resolves those frames to **original source** (e.g. `server/routes.ts:123`) using `dist/index.js.map`. The Docker/staging build includes the source map, so incident notifications and emails show real file names and lines.

**PushLog frontend (client):** The Vite build generates source maps and the **@sentry/vite-plugin** uploads them to Sentry when you build with the right env vars set. That way Sentry can symbolicate client errors (e.g. on `/organization`) and show original file:line. To enable:

1. **Create an auth token** in Sentry: [Organization Settings → Auth Tokens](https://sentry.io/settings/account/api/auth-tokens/) (or Org → Auth Tokens). Use a token with "Project: Read & Write" and "Release: Admin".
2. **Set when building** (CI or locally):
   - `SENTRY_ORG` — your Sentry org slug (e.g. from the Sentry URL).
   - `SENTRY_PROJECT` — your Sentry project slug (the project that receives the frontend DSN from `VITE_SENTRY_DSN`).
   - `SENTRY_AUTH_TOKEN` — the token from step 1.
   You can put these in a file `.env.sentry-build-plugin` in the project root (add it to `.gitignore`; it is already ignored) so `npm run build` uploads source maps. Example:
   ```bash
   SENTRY_ORG=your-org-slug
   SENTRY_PROJECT=your-project-slug
   SENTRY_AUTH_TOKEN=sntrys_...
   ```
3. Run `npm run build`. The plugin uploads client source maps and injects the release into the bundle so events match. If `SENTRY_AUTH_TOKEN` is not set, the plugin is disabled and the build still succeeds (but Sentry won’t have source maps for that build).

**Your application (errors sent to Sentry):** Stack traces in Sentry events come from *your* app (frontend or backend). To see **original source** instead of bundled/minified code:

1. **Upload source maps to Sentry** for the project that sends events. In Sentry: Project → Settings → Source Maps. Use the Sentry CLI or your build pipeline to upload the `.map` files (and optionally release artifacts). Sentry will then symbolicate and can send resolved file paths in the webhook payload.
2. PushLog does **not** symbolicate your app’s stack traces itself; it only resolves its own server bundle (`index.js` → `server/*.ts`). So for readable traces from your codebase, use Sentry’s source map upload.

If `index.js.map` is missing in production, you’ll see a warning during the Docker build (`scripts/build-for-docker.sh`). Ensure `npm run build` uses `--sourcemap` (it does) and that the built `dist/` folder is copied into the image so `dist/index.js.map` is present at runtime.

If **PushLog's own frontend** stack traces in Sentry still show bundled paths (e.g. `/js/settings-xxx.js` instead of `settings.tsx:123`), see [SENTRY_SOURCEMAP_DEBUG.md](SENTRY_SOURCEMAP_DEBUG.md) for step-by-step diagnostics.

---

## Reducing notification noise

**Deploy incidents:** By default, every GitHub push creates a "Deploy" incident notification. If that's too noisy, set in your environment:

```bash
DISABLE_DEPLOY_INCIDENTS=true
```

This stops push events from being sent to the incident engine. You'll still get Sentry error alerts (spike, regression, new issue).

## PushLog crash notifications (like “PushLog is down”)

When PushLog itself hits an **uncaught exception** or **unhandled promise rejection**, it emails only **users who have at least one repository connected** and **“Receive incident notifications”** enabled in Settings (and “Email incident alerts” for the actual email). No env var required.

The same incident email template is used as for Sentry/incident-engine alerts, including the **Error message** section.

## Deploy Correlation (Optional)

To correlate errors with recent deploys, include a **change window** when sending events. PushLog's GitHub integrations do this automatically for push events. For Sentry-only setups, you'd need to:

1. Use a release/deploy tracking tool that POSTs to `/api/webhooks/incidents` with `change_window`
2. Or rely on the incident engine's spike/regression detection (no deploy correlation)

---

## Testing & Verifying

### 1. Confirm the webhook URL

In Sentry → **Settings** → **Developer Settings** → **Custom Integrations** → your PushLog integration:

- Webhook URL should be your unique per-app URL from PushLog Settings (e.g. `https://pushlog.ai/api/webhooks/sentry/pls_xxx`)
- Webhook Secret should match the secret shown when you created the app in PushLog
- Save if you change it

### 2. Trigger a test alert

1. In Sentry → your project → **Settings** → **Projects** → [your project]
2. Find **Create Sample Event** or **Send Test Alert**
3. Or add the Sentry `ErrorButton` to your app and click it to trigger a real error

### 3. Check Sentry Alert History

In Sentry → **Alerts** → **Alert History** to see if the rule fired and if the webhook was sent (success/failure).

### 4. Optional: test the URL is reachable

From your terminal (to confirm the endpoint is public and accepting requests):

```bash
curl -X POST https://pushlog.ai/api/webhooks/sentry/YOUR_TOKEN \
  -H "Content-Type: application/json" \
  -d '{"data":{"event":{}}}'
```

Replace `YOUR_TOKEN` with your app's token from the webhook URL (the part after `/sentry/`).

- **202** or **400** = endpoint reachable (400 is expected for empty payload)
- **Connection refused / timeout** = firewall, wrong URL, or app not running

### 5. View PushLog logs on EC2

SSH into your EC2 instance and run:

```bash
# Live logs (follow new output)
pm2 logs pushlog-prod

# Last 200 lines
pm2 logs pushlog-prod --lines 200

# Only Sentry/incident-related lines
pm2 logs pushlog-prod --lines 500 --nostream | grep -E "webhooks/sentry|incident-engine"
```

**What to look for:**

| Log line | Meaning |
|----------|---------|
| `[webhooks/sentry] Request received` | Sentry's webhook hit your server |
| `[webhooks/sentry] Ingested: ... in .../...` | Event parsed and sent to incident engine |
| `[incident-engine] incident inc-xxx (new_issue) ...` | Engine triggered; notification created |
| `[incident-engine] child not writable; event dropped` | Incident-engine binary missing or crashed |
| `Sentry webhook error:` | Parsing or processing failed |

If you see **Request received** but not **Ingested**, the payload may be missing `data.event`. If you see **Ingested** but not **incident inc-xxx**, the engine may not have triggered (e.g. environment not "prod").

---

## Troubleshooting

**No incidents showing up?**
- Confirm the Sentry alert rule fired (check Sentry's Alert History)
- Verify the webhook URL and that PushLog is reachable from Sentry
- Check PushLog server logs for `[webhooks/sentry]` entries

**Wrong format errors?**
- PushLog expects Sentry's **Issue Alert** webhook format. If using a custom integration, ensure it sends the standard `event_alert` payload.

**Need the generic webhook instead?**
- Use `POST /api/webhooks/incidents` with the [Incident Event schema](../server/incidentEngine.ts) — useful for Datadog, custom scripts, etc.

**Want to test without Sentry?**
- Set `ENABLE_TEST_ROUTES=true` and use **Simulate production incident** on Integrations → Incident Alerts. Or `POST /api/test/simulate-incident` (authenticated). Sends a realistic Sentry-style event and triggers a notification.

---

## Related

- [PushLog README](../README.md)
