# Incident notification targeting — implementation plan

**Status:** Implemented | **Phase:** 2 (depends on Teams)  
**Ref:** ROADMAP.md § Incident notification targeting; `getIncidentNotificationTargets` / `getIncidentNotificationTargetsForOrg` in `server/sentryWebhook.ts`.

---

## Goal

Let the account owner/admin choose who receives incident notifications and optionally delegate and prioritize:

- **Users with repos** — Only users who have at least one connected repository (default).
- **All users** — Everyone in the organization (except viewers, unless config says otherwise).
- **Specific users** — Admin picks which users or roles get incidents.
- **Delegation** — Assign responsibility per person (e.g. who gets which types, or who owns which repos/services).
- **Priority** — Ordering for who receives notifications (e.g. on-call first, then backup).

---

## Prerequisites

- **Phase 1 (Teams) done:** Organizations, members, roles (owner/admin/developer/viewer) and org-scoped repos/integrations exist. No additional dependency.

---

## 1. Data model

### 1.1 Organization-level incident targeting settings

Store one policy per organization (no per-incident-type in v1 if we want to ship small).

**Table: `organization_incident_settings`**

| Column | Type | Description |
|--------|------|-------------|
| `organization_id` | uuid PK, FK | Org this applies to |
| `targeting_mode` | text | `users_with_repos` \| `all_members` \| `specific_users` |
| `specific_user_ids` | uuid[] | When mode = specific_users, list of user IDs (nullable) |
| `specific_roles` | text[] | When mode = specific_users, optional role filter e.g. `['owner','admin','developer']` (nullable) |
| `priority_user_ids` | uuid[] | Ordered list: first gets notified first, etc. (optional; if empty, no ordering) |
| `include_viewers` | boolean | When true, viewers can receive incidents (default false) |
| `updated_at` | timestamp | Last change |

Keep per-user `receiveIncidentNotifications` (Settings): if false, user is excluded regardless of org policy.

### 1.2 Delegation (optional for v1)

- **v1:** Only "who gets incidents" (mode + specific users/roles) and optional "priority order". No per-repo or per-severity rules.
- **v2:** Add delegation rules table for "who gets which types" or "who owns which repo/service".

---

## 2. API

### 2.1 GET /api/org/incident-settings

- **Auth:** authenticateToken, requireOrgMember, requireOrgRole(["owner", "admin"]).
- **Response:** Current org incident targeting (targeting_mode, specific_user_ids, specific_roles, priority_user_ids, include_viewers). Default when no row: targeting_mode "users_with_repos", others null/false.

### 2.2 PATCH /api/org/incident-settings

- **Auth:** Same as above.
- **Body:** Same shape as response; partial updates allowed.
- **Validation:** If targeting_mode === "specific_users", require at least one of specific_user_ids or specific_roles. priority_user_ids must be subset of allowed targets or empty.

---

## 3. Backend targeting logic

### 3.1 Resolve allowed targets for an org

Extend or replace getIncidentNotificationTargetsForOrg in server/sentryWebhook.ts:

- Load organization_incident_settings(orgId).
- If mode "all_members": all org members (respect include_viewers); filter by receiveIncidentNotifications per user.
- If mode "specific_users": union of specific_user_ids and members with roles in specific_roles; filter by receiveIncidentNotifications.
- If mode "users_with_repos" (default): current behavior — members who have at least one repo in the org (or org has repos and we consider "users with access"); filter by receiveIncidentNotifications.
- Apply priority_user_ids order if set (notify in that order, then remaining).
- Return ordered list of user IDs.

### 3.2 Where to resolve org from an incident

- Sentry: map event to repo or integration (e.g. incidentServiceName or project); repo/integration has organizationId. Use that org for getIncidentNotificationTargetsForOrg.
- Internal incidents (spike/regression): incident engine should have org from repo/integration; pass it into the resolver.
- Fallback: when no org context, keep existing getIncidentNotificationTargets() for backward compatibility.

---

## 4. UI

### 4.1 Location

Organization page (preferred) — new section "Incident notifications" visible only to owner/admin.

### 4.2 Controls

- **Who receives incidents:** Radio/select: "Users with repos", "All members", "Specific users/roles".
- If "Specific users": multi-select users and/or roles (e.g. Admin and Developer).
- **Include viewers:** Checkbox (when "All members" or "Specific users").
- **Priority order (optional):** Ordered list of users — "Notify in this order (e.g. on-call first)."
- Save: PATCH /api/org/incident-settings.

### 4.3 Copy

Default: "Users with repos"; help text: "Choose who in the organization receives Sentry and incident alerts. Per-user 'Receive incident notifications' in Settings still applies."

---

## 5. Implementation order

| Step | Task |
|------|------|
| 1 | Add organization_incident_settings table (schema + migration). |
| 2 | DB layer: getOrganizationIncidentSettings, upsert. |
| 3 | Routes: GET and PATCH /api/org/incident-settings. |
| 4 | sentryWebhook: implement new getIncidentNotificationTargetsForOrg using settings; keep per-user receiveIncidentNotifications. |
| 5 | Sentry webhook + incident engine: resolve org from incident, call org-based targeting when org present; fallback to legacy. |
| 6 | UI: Organization page section + form + save. |
| 7 | (Optional) Test incident button that uses org targeting. |

---

## 6. Files to touch

- shared/schema.ts — new table organization_incident_settings.
- server/database.ts — CRUD for org incident settings.
- server/routes.ts — GET/PATCH /api/org/incident-settings.
- server/sentryWebhook.ts — use org when available; new resolver.
- client: Organization page — incident settings section and member "Last active" (see below).
