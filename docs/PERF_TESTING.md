# Performance testing for slow page loads

Useful when debugging slow Settings or other page loads (e.g. "3 seconds to load logged-in user").

## 1. Server-side timing (LOG_PERF)

Run the server with `LOG_PERF=1` to log breakdowns for key routes:

```bash
LOG_PERF=1 npm run dev
# or
LOG_PERF=1 npm run start
```

Then load the Settings page and check server logs. You'll see lines like:

```
[perf] /api/profile sessionSave: 45ms
[perf] /api/profile getUser: 12ms
[perf] /api/profile githubValidation: 1850ms   ← slow! (GitHub API call)
[perf] /api/profile membership+org: 8ms
[perf] /api/profile total: 1920ms
[perf] /api/org total: 25ms
[perf] /api/account/data-summary getUser: 15ms
[perf] /api/account/data-summary repos+integrations+workspaces+payments: 80ms
[perf] /api/account/data-summary total: 120ms
```

**Common culprits:**
- `githubValidation` — blocking call to GitHub API; can take up to 2s (timeout). Consider making this non-blocking or caching.
- `sessionSave` — Express session write to DB; can be slow if DB or connection pool is under load.
- `getUser` / `membership+org` — DB queries; check indexes and connection latency.

## 2. Client-side endpoint timing script

Measure how long each Settings-related API takes from your machine:

```bash
# Get your session cookie: DevTools → Application → Cookies → connect.sid (copy full value)

npm run test:endpoint-timing -- http://localhost:5001 "connect.sid=s%3A..."
# or for staging:
npm run test:endpoint-timing -- https://staging.pushlog.ai "connect.sid=s%3A..."
```

Or with the shell script:

```bash
./scripts/test-endpoint-timing.sh http://localhost:5001 "connect.sid=s%3A..."
```

## 3. Quick wins

- **GitHub validation:** Runs on every profile load for GitHub-connected users. Consider skipping or caching (e.g. validate once per hour, or run in background).
- **Session save:** `req.session.save()` is awaited on every profile request. Could be made fire-and-forget if cookie refresh isn't critical for that request.
- **Data-summary:** Queries are now parallelized; previously sequential. If still slow, add indexes or reduce data fetched.
