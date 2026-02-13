# Staging (staging.pushlog.ai)

## Checking the staging Postgres database

Staging Postgres runs in Docker and is exposed on the host at **127.0.0.1:5433**.

**From the EC2 host** (with staging stack running: `docker compose -f docker-compose.staging.yml up -d`):

```bash
# Interactive psql
psql "postgresql://pushlog:pushlog_staging_password@127.0.0.1:5433/pushlog_staging"

# One-off query
psql "postgresql://pushlog:pushlog_staging_password@127.0.0.1:5433/pushlog_staging" -c "SELECT id, username, email FROM users LIMIT 5;"
```

**From inside the DB container:**

```bash
docker exec -it pushlog-staging-db psql -U pushlog -d pushlog_staging -c "\dt"
```

**Run migrations (from host, with devDependencies installed):**

```bash
DATABASE_URL="postgresql://pushlog:pushlog_staging_password@127.0.0.1:5433/pushlog_staging" npm run db:push
```

---

## Basic Auth popup (username/password) on every refresh

The HTTP Basic Auth prompt is enforced by nginx. To reduce how often the browser asks:

1. **Use one consistent realm** in your nginx config for all staging routes, e.g.:
   ```nginx
   auth_basic "Staging";
   auth_basic_user_file /etc/nginx/.htpasswd_pushlog_staging;
   ```
   Same realm everywhere lets the browser reuse credentials for that origin.

2. **Save the URL in your password manager** (e.g. staging.pushlog.ai with the staging username/password) so it can auto-fill the Basic Auth dialog.

Browsers do not persist Basic Auth across closing the browser unless you use a password manager. There is no way to get “remember me” across sessions with plain Basic Auth without adding a custom cookie-based gate (e.g. a one-time password page that sets a cookie and nginx `auth_request`).

---

## GitHub OAuth on staging

For “Sign in with GitHub” on staging to return to **staging.pushlog.ai** (not pushlog.ai):

1. **App config**  
   - Staging already sets `APP_URL=https://staging.pushlog.ai` in `docker-compose.staging.yml`.  
   - The client uses `window.location.origin` for the redirect URI when `VITE_GITHUB_REDIRECT_URI` is not set, so the same build works for both prod and staging.

2. **GitHub OAuth app**  
   In GitHub: **Settings → Developer settings → OAuth Apps** → your app → add this as an **Authorization callback URL**:
   ```text
   https://staging.pushlog.ai/api/auth/user
   ```
   Save. After that, logging in with GitHub on staging will redirect back to staging.
