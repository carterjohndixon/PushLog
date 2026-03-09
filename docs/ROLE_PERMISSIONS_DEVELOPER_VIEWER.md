# Role permissions: how Developer and Viewer should differ

## Summary

| Role     | Who it's for                    | Main difference vs others                    |
|----------|----------------------------------|----------------------------------------------|
| **Owner**   | One per org; full control       | Can delete org, transfer ownership           |
| **Admin**   | Day-to-day admins               | Same as owner except cannot delete org       |
| **Developer** | People who ship code / manage integrations | Can **act** on repos they’re on (integrations, repo settings). Cannot add org repos or invite. |
| **Viewer**  | Read-only (PMs, designers, execs) | Can **only view**. No creating/editing integrations or repo settings. Excluded from incident pool by default. |

---

## Permission matrix (proposed)

### Organization

| Capability | Owner | Admin | Developer | Viewer |
|------------|:-----:|:-----:|:---------:|:------:|
| View org name, domain, member list | ✅ | ✅ | ✅ | ✅ |
| Edit org name / domain | ✅ | ✅ | ❌ | ❌ |
| Delete organization | ✅ | ❌ | ❌ | ❌ |
| Invite members (email, link, GitHub org) | ✅ | ✅ | ❌ | ❌ |
| Change another member’s role | ✅ | ✅ | ❌ | ❌ |
| Remove another member | ✅ | ✅ | ❌ | ❌ |
| View member details (incl. repos they’re on) | ✅ | ✅ | ❌ | ❌ |
| Incident notification settings (who receives alerts) | ✅ | ✅ | ❌ | ❌ |

*No change from today: only owner/admin manage org and members.*

---

### Repositories (org-level)

| Capability | Owner | Admin | Developer | Viewer |
|------------|:-----:|:-----:|:---------:|:------:|
| Add / connect repo to org | ✅ | ✅ | ❌ | ❌ |
| Remove / disconnect repo from org | ✅ | ✅ | ❌ | ❌ |
| Manage per-repo team (who can see repo) | ✅ | ✅ | ❌ | ❌ |
| **See** repos (filtered by per-repo team) | ✅ all | ✅ all | ✅ only repos they’re on | ✅ only repos they’re on |

*Today: developer and viewer already see only repos they’re on. Only owner/admin can add/remove repos and manage team. No change here.*

---

### Repositories (repo-level, for repos they have access to)

| Capability | Owner | Admin | Developer | Viewer |
|------------|:-----:|:-----:|:---------:|:------:|
| Pause / resume repo (isActive) | ✅ | ✅ | **✅** | ❌ |
| Edit repo settings (branch, critical paths, incident service name, monitor all branches) | ✅ | ✅ | **✅** | ❌ |
| Delete repo | ✅ | ✅ | ❌ | ❌ |

*Change: **Developer** can pause/resume and edit repo settings for repos they’re on. **Viewer** cannot. Delete stays owner/admin only.*

---

### Integrations (Slack, etc.)

| Capability | Owner | Admin | Developer | Viewer |
|------------|:-----:|:-----:|:---------:|:------:|
| Create integration (connect Slack channel to repo) | ✅ | ✅ | **✅** (for repos they’re on) | ❌ |
| Edit integration (channel, notification level, AI settings, etc.) | ✅ | ✅ | **✅** (integrations they can access) | ❌ |
| Pause / resume integration | ✅ | ✅ | **✅** | ❌ |
| Delete integration | ✅ | ✅ | **✅** (integrations they can access) | ❌ |
| **See** integrations (for repos they’re on) | ✅ | ✅ | ✅ | ✅ |

*Change: **Developer** can create, edit, pause, delete integrations for repos they’re on. **Viewer** can only see integrations; no create/edit/delete.*

---

### Viewing (dashboard, push events, search, analytics)

| Capability | Owner | Admin | Developer | Viewer |
|------------|:-----:|:-----:|:---------:|:------:|
| Dashboard (repos, integrations, stats) | ✅ | ✅ | ✅ | ✅ |
| Push events, search, analytics | ✅ | ✅ | ✅ | ✅ |
| Notifications (in-app) | ✅ | ✅ | ✅ | ✅ |

*No change: all roles see the same data for the repos they have access to.*

---

### Incident notifications (who receives Sentry / incident alerts)

| Capability | Owner | Admin | Developer | Viewer |
|------------|:-----:|:-----:|:---------:|:------:|
| Included in “Users with access to repos” / “All members” / “Specific users” | ✅ | ✅ | ✅ | Only if “Include viewers” is on |
| Configure incident targeting (org settings) | ✅ | ✅ | ❌ | ❌ |

*No change: viewers stay excluded from the incident pool unless “Include viewers” is enabled.*

---

### Account / profile (Settings)

| Capability | Owner | Admin | Developer | Viewer |
|------------|:-----:|:-----:|:---------:|:------:|
| Edit own profile, GitHub connect, MFA, AI credits, notification prefs | ✅ | ✅ | ✅ | ✅ |
| Developer mode (test features) | ✅ | ✅ | ✅ | ✅ |

*No change: personal settings are per user, not role-gated.*

---

## Implementation checklist (Developer vs Viewer)

### Backend

- [ ] **New helper** e.g. `canManageReposAndIntegrations(role)` → `role === "owner" || role === "admin" || role === "developer"`.
- [ ] **Repo mutations** (PATCH repo settings, pause/resume): allow if owner/admin **or** (developer **and** user has access to that repo). Viewer → 403.
- [ ] **Integration create** (POST /api/integrations): allow if owner/admin **or** (developer **and** repo is in user’s repo list). Viewer → 403.
- [ ] **Integration update/delete** (PATCH/DELETE /api/integrations/:id): allow if owner/admin **or** (developer **and** integration’s repo is in user’s repo list). Viewer → 403.
- [ ] **Repo delete** (DELETE /api/repositories/:id): keep owner/admin only (no change).
- [ ] **Repo connect/remove, per-repo team**: keep owner/admin only (no change).
- [ ] Incident targeting logic: unchanged (viewers excluded unless “Include viewers”).

### Client

- [ ] **`canManageRepos`** (add/remove repos, manage team): keep `role === "owner" || role === "admin"`.
- [ ] **`canManageIntegrations`** (new or reuse): `role === "owner" || role === "admin" || role === "developer"` → show Add Integration, edit/pause/delete on integration cards, repo settings (branch, critical paths, etc.), repo pause/resume.
- [ ] **Viewer**: hide “Add Integration”, integration edit/delete/pause, repo settings, repo pause/resume. Show only view/read UI.
- [ ] **Settings → “What each role can do”**: update Developer and Viewer bullets to match this matrix.

### Optional (later)

- [ ] **Developer**: allow “Manage team” for repos they’re on? (Current spec: no; only owner/admin manage team.)
- [ ] **Viewer**: restrict to certain pages (e.g. dashboard + read-only integrations list) if you want to hide Repositories / Integrations “manage” entry points entirely.

---

## One-line summary

- **Developer** = can **use and configure** repos they’re on (integrations, repo settings, pause/resume). Cannot add org repos, manage org, or invite.
- **Viewer** = **view only** for repos they’re on. No creating/editing integrations or repo settings. Excluded from incident pool unless “Include viewers” is on.
