# PushLog Roadmap

Future features and plans. Not scheduled—captured for when we're ready.

---

## Implementation order

**Phase 1: Teams & organization model** (first)  
Today's per-user layout doesn't support incident targeting or delegation. Teams provide the structure (admin, members, roles) needed for those features.

**Phase 2: Incident notification targeting** (depends on Phase 1)  
Once teams exist, the account owner can configure who receives incident notifications, set priorities, and delegate responsibility per person.

---

## OpenAI API key (bring your own)

**Status:** TODO

**Context:** PushLog's supported models (when using credits) are OpenAI API. Today users can either use PushLog credits (PushLog's OpenAI key) or add an OpenRouter key. But OpenRouter adds a layer—users who already have OpenAI accounts may prefer to use their own OpenAI key directly.

**Goal:** Let users enter their own OpenAI API key. When set, use it for summaries instead of PushLog credits—user pays OpenAI directly, same models (GPT-4o, etc.). No credit deduction.

**Options after implementation:**
- **PushLog credits** — Uses PushLog's OpenAI key; user buys credits.
- **User's OpenAI key** — Uses user's key; user pays OpenAI. Same provider, simpler than OpenRouter for OpenAI-only users.
- **User's OpenRouter key** — (Existing) For users who want access to other providers (Anthropic, etc.).

---

## Teams & organization model

**Status:** TODO | **Phase:** 1 (first)

**Context:** PushLog is for GitHub change logging and incident tracking. Today it’s per-user: each developer manages their own repos and integrations. Some teams want a shared setup.

**Goal:** Allow a CTO (or admin) to create a PushLog account and add developers to a team.

### Behavior

- **Admin (e.g. CTO)** creates the PushLog account and is the account owner.
- **Admin** can invite and add developers to the team.
- **Shared visibility:** All repos and integrations are visible to everyone on the team.
- **Restricted edits:** Only the admin can create, edit, or delete repos and integrations. Developers have read-only (or limited) access—they see everything but can’t change config.
- Developers still get their own push notifications, incident alerts, etc. based on what the admin has configured.

### Invite flow (preference: support all)

- **Shareable link** — Admin creates a link (e.g. `pushlog.ai/join/abc123`) and sends it. Anyone with the link can join the team (role assigned by admin when they create the link, or on join).
- **Create user + email invite** — Admin creates a placeholder user (email, name) and sends an invite. The invitee gets an email and can choose how to sign up (email/password, GitHub OAuth, etc.) to claim that account.
- **GitHub org sync** — Connect a GitHub org; pull in members. Whoever creates/owns the org connection can delegate roles per person (admin, developer, viewer, etc.).

### Account type at launch

When these features ship, users choose **Team / Business** vs **Solo**. Two different UIs:
- **Solo** — Current per-user experience, no team concepts.
- **Team** — Full team model, invites, roles, shared visibility, delegation.

Existing users can stay solo or opt in to create a team.

### Possible extensions

- Role-based permissions (admin vs developer vs viewer).
- Billing/seat count per team.
- Multiple teams under one organization.

**Ref:** Discussion Feb 2026.

---

## Incident notification targeting

**Status:** TODO | **Phase:** 2 (depends on Teams)

**Context:** Today incident notifications go to all users (or `INCIDENT_NOTIFY_USER_IDS` if set). No in-app control. The current layout doesn't support this—Teams must exist first so there's an admin, members, and roles to configure.

**Goal:** Add a user-facing setting so the account owner (admin) can choose who receives incident notifications and delegate responsibility:

- **Users with repos** — Only users who have at least one connected repository (default, keeps noise down).
- **All users** — Everyone in the account/team.
- **Specific users** — Admin picks which users (or roles) get incidents.
- **Delegation** — Admin can assign responsibility per person (e.g. who gets which types of incidents, or who owns which repos/services).
- **Priority** — Configurable priority/ordering for who receives notifications (e.g. on-call first, then backup).

`INCIDENT_NOTIFY_USER_IDS` would remain as an env override for advanced/enterprise use.

**Ref:** Discussion Feb 2026; `getIncidentNotificationTargets` in `server/routes.ts`, `sentryWebhook.ts`.

---

## Questions / open items

(Still to decide)

- **Delegation granularity:** Start with person + priority only, or add repo/service or severity filters from day one?
- **Billing:** App is currently free. See "Billing (future)" section below.

---

## Delegation granularity (explained)

When the admin "delegates per person," *what* are they assigning? Options:

| Granularity | Meaning | Example |
|-------------|---------|---------|
| **By repo/service** | Person A gets incidents for `api`, person B for `frontend`. | "Sarah owns api incidents, Mike owns frontend." |
| **By severity** | Person A gets critical only, person B gets all. | "On-call gets critical; team gets error/warning." |
| **By type (Sentry vs deploy)** | Person A gets Sentry errors, person B gets deploy failures. | "Backend on-call gets Sentry; DevOps gets deploy incidents." |

Simplest first version: **by person + priority** only ("who gets incidents" and "try person 1 first, then 2"). Add repo/service or severity filters later if needed.

---

## Billing (future consideration)

App is free today. If/when you monetize, common patterns:

| Option | Pros | Cons |
|--------|------|------|
| **Fixed price per team** (e.g. $29/mo unlimited members) | Simple, predictable. | May leave money on table for large teams. |
| **Per-seat** (e.g. $X per user/month) | Scales with value. Familiar. | Can feel expensive as team grows. |
| **Free solo + paid teams** | Solo stays free (good for adoption). | Need to define team vs solo clearly. |

**Recommendation:** Free solo, fixed price for teams (e.g. $19–29/mo per team, unlimited seats). Simple to build and explain. Add per-seat or usage-based later if needed.