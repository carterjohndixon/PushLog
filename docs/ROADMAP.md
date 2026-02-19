# PushLog Roadmap

Future features and plans. Not scheduled—captured for when we're ready.

---

## Incident notification targeting ( setting )

**Status:** TODO

Today: incident notifications go to all users (or `INCIDENT_NOTIFY_USER_IDS` if set). No in-app control.

**Goal:** Add a user-facing setting so the account owner can choose who receives incident notifications:

- **Users with repos** — Only users who have at least one connected repository (default, keeps noise down).
- **All users** — Everyone in the account.
- **Specific users** — Admin picks which users (or roles) get incidents.

`INCIDENT_NOTIFY_USER_IDS` would remain as an env override for advanced/enterprise use.

**Ref:** Discussion Feb 2026; `getIncidentNotificationTargets` in `server/routes.ts`.

---

## Teams & organization model

**Status:** TODO

**Context:** PushLog is for GitHub change logging and incident tracking. Today it’s per-user: each developer manages their own repos and integrations. Some teams want a shared setup.

**Goal:** Allow a CTO (or admin) to create a PushLog account and add developers to a team.

### Behavior

- **Admin (e.g. CTO)** creates the PushLog account and is the account owner.
- **Admin** can invite and add developers to the team.
- **Shared visibility:** All repos and integrations are visible to everyone on the team.
- **Restricted edits:** Only the admin can create, edit, or delete repos and integrations. Developers have read-only (or limited) access—they see everything but can’t change config.
- Developers still get their own push notifications, incident alerts, etc. based on what the admin has configured.

### Possible extensions

- Role-based permissions (admin vs developer vs viewer).
- Billing/seat count per team.
- Multiple teams under one organization.

**Ref:** Discussion Feb 2026.
