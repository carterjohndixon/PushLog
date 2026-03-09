# Row Level Security (RLS) for Supabase / Postgres

Which tables should have RLS **enabled** vs **disabled**, and how to lock down prod.

---

## Summary

| Table | RLS | Reason |
|-------|-----|--------|
| **Tenant / user data** | **ON** | Restrict access by org or user so other roles (or leaked credentials) can't see other tenants' data. |
| **Global lookup / system** | **OFF** or permissive policy | `ai_model_pricing`, `login_lockout` are not tenant-scoped; app (or any process) needs to read/update them. |

Your app connects with a **single role** (e.g. `postgres` or the Supabase pooler user). For the app to keep working without code changes, that role should have **BYPASSRLS**. Then RLS only affects **other** roles (e.g. a read-only reporting user, or future Supabase Auth roles). Enabling RLS on tables still “fixes” unrestricted access for any role that does **not** have BYPASSRLS.

---

## Tables: RLS ON (tenant/user-scoped)

Enable RLS so that, for roles *subject* to RLS, only allowed rows are visible.

| Table | Scoped by | Note |
|-------|-----------|------|
| `users` | `organization_id` | User belongs to one org. |
| `organizations` | `owner_id` / membership | Org visibility by membership. |
| `organization_memberships` | `organization_id` | Members of the org. |
| `organization_invites` | `organization_id` | Invites for the org. |
| `organization_incident_settings` | `organization_id` | One row per org. |
| `repositories` | `organization_id` | Repos belong to org. |
| `repository_members` | `repository_id` → org | Via repo’s org. |
| `integrations` | `organization_id` | Integrations per org. |
| `push_events` | `repository_id` → org | Via repo. |
| `push_event_files` | `push_event_id` → repo → org | Via push_events. |
| `slack_workspaces` | `organization_id` | Per org. |
| `notifications` | `user_id` | Per user. |
| `ai_usage` | `user_id` | Per user. |
| `analytics_stats` | `user_id` | Per user. |
| `payments` | `user_id` | Per user. |
| `favorite_models` | `user_id` | Per user. |
| `user_daily_stats` | `user_id` | Per user. |
| `oauth_identities` | `user_id` | Links to user. |
| `user_sessions` | `sess->>'userId'` | Session store; restrict by user in session. |
| `oauth_sessions` | `user_id` | Temporary OAuth state. |

---

## Tables: RLS OFF (or permissive policy)

| Table | Reason |
|-------|--------|
| `ai_model_pricing` | Global catalog; same for all tenants. No tenant column. Leave RLS **off** or add a single “allow read for all” policy if you enable RLS for consistency. |
| `login_lockout` | Global lockout by identifier; any app instance must be able to read/update. Leave RLS **off**. |

---

## App role and BYPASSRLS

- The role your app uses (e.g. `postgres`, or the user in `DATABASE_URL`) should have **BYPASSRLS** so it can read/write all tables as it does today.
- Then:
  - **RLS ON** on the tables above = they are no longer unrestricted for *other* roles.
  - **RLS OFF** on `ai_model_pricing` and `login_lockout` = app and any role can use them.

If you later introduce a role **without** BYPASSRLS (e.g. reporting user, or Supabase anon/authenticated), you’ll add policies that use `current_setting('app.organization_id', true)` (or similar) set by the app per request.

---

## Running the script

1. Replace `app_role` in the script with the actual role your app uses (from `DATABASE_URL`).
2. Connect to **prod** (e.g. Supabase SQL Editor or `psql $DATABASE_URL`).
3. Run the script.

Afterward, verify the app still works (same role, BYPASSRLS). Then any new role without BYPASSRLS will be restricted by RLS until you add policies for it.
