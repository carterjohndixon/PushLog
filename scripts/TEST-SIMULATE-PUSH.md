# Test: Simulate push → AI → Slack

Use this to trigger the same flow as a real push (AI summary + Slack) and watch server logs.

## 1. Enable the test route

On the server (or in `.env`):

```bash
export ENABLE_TEST_ROUTES=true
```

Then restart the app (e.g. `pm2 restart pushlog`). For local dev, the route is already enabled when `NODE_ENV=development`.

## 2. Trigger from the browser (easiest)

1. Log in at **https://pushlog.ai** (or your app URL).
2. Open DevTools → **Console** (F12).
3. Run:

```javascript
fetch('/api/test/simulate-push', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: '{}'
}).then(r => r.json()).then(console.log);
```

4. Watch your **server logs** (e.g. `pm2 logs pushlog`). You should see:

- `🧪 [TEST] Simulate push: ...`
- `🤖 Using ... AI for integration ...`
- `🔍 OpenAI/OpenRouter API Request ...`
- `✅ AI summary generated ...` (or similar)
- `🧪 [TEST] Sending Slack notification ...`
- `🧪 [TEST] ✅ AI Slack message sent`

5. Check Slack for the test message.

## 3. Optional: use a specific integration

If you have multiple integrations and want to test one in particular:

```javascript
fetch('/api/test/simulate-push', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ integrationId: 25 })  // use your integration id
}).then(r => r.json()).then(console.log);
```

## 4. curl (with session cookie)

If you have a session cookie (e.g. from browser Application → Cookies → `connect.sid`):

```bash
curl -X POST https://pushlog.ai/api/test/simulate-push \
  -H "Content-Type: application/json" \
  -b "connect.sid=YOUR_SESSION_COOKIE_VALUE" \
  -d '{}'
```

Replace `YOUR_SESSION_COOKIE_VALUE` and the host if needed.
