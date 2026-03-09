# Solo vs Team choice — draft

**Goal:** Let users choose (or infer) whether they're using PushLog **solo** vs as a **team**, so we can tailor onboarding and, later, billing.

---

## Recommended flow: choose at signup, edit in Settings

**1. Sign up**  
User completes sign up (email/password or OAuth). Account and a default org are created (same as today).

**2. Account type screen (first-time only)**  
Right after sign up (or right after first login for new users), show a single step:

- **Title:** e.g. "How will you use PushLog?"
- **Options:**
  - **Solo** — "Just me. I'll manage my own repos and notifications."
  - **Organization** — "My team. I'll invite others and manage who sees what."
- **Action:** User picks one. Save choice on the org: `organizations.type` = `"solo"` or `"team"` (or `"organization"` if you prefer that label). Then redirect to dashboard (or next onboarding step).
- **Skip for existing users:** Only show this screen when the org has never had this set (e.g. backfill existing orgs as `"solo"` and don’t show the step).

**3. After that**  
- **Solo:** Dashboard and nav as today. Optionally hide or downplay "Organization" in the header/sidebar, or show it but with a simple "Just you" view and a "Switch to Organization" CTA if they later want to invite people.
- **Organization:** Show "Organization" prominently; dashboard or first-run hint can say "Invite your first teammate" with a link to Organization → Invite.

**4. Change later in Settings**  
- **Settings → Account** (or similar): add **"Account type"** with two options — **Solo** / **Organization** (same as the signup step).
- User can switch anytime. **Solo → Organization:** enable full org/invite UI if it was hidden. **Organization → Solo:** set `organizations.type` to `"solo"`; don’t remove existing members (they’re still in the org), but you can hide invite/team UI and treat billing as solo if/when you add billing.
- Optional: if they have 2+ members and switch to Solo, show a short confirmation: "You’re currently in an organization with other members. Switching to Solo only changes how the app is presented; members stay. Invites and org settings will be hidden until you switch back."

**5. Summary**  
- One screen at signup: **Solo** vs **Organization**.  
- Same choice editable in **Settings** anytime.  
- Backend: persist as `organizations.type`; use it to show/hide or reorder Organization and invite flows. No need to change permissions or data model beyond that until you add billing.

---

## What it could look like

| Option | When | What the user sees |
|--------|------|--------------------|
| **A. Explicit choice at signup** | Right after sign up (or on first login) | Step: "How will you use PushLog?" → **Solo** (just me) or **Team** (I'll invite others). Solo: current single-user flow, maybe hide or downplay Organization in nav until they "upgrade." Team: show Organization, invite CTA, "Invite your first teammate." |
| **B. Choice in Settings** | Anytime | Settings → "Account type" → Solo / Team. Solo = no invite UI, no org page (or read-only). Team = full org, invites, roles. Toggle could set `organizations.type` or a user-level preference. |
| **C. Implicit (no choice)** | Never | Don't ask. **Solo** = org with 1 member (current). **Team** = org with 2+ members. UI already adapts (e.g. Organization page hides incident targeting when `memberCount <= 1`). No new flow; "solo" is just "org of one." |

---

## Is it necessary?

| Reason | Necessary? | Notes |
|--------|------------|--------|
| **Billing (free solo, paid team)** | **Yes** | You need a clear rule for who pays. Options: (1) Explicit type (solo vs team) on org or account; (2) Derived: solo = 1 member, team = 2+ (then first invite triggers "upgrade to team" / paywall). |
| **Onboarding / positioning** | **No** | Nice to have. Lets you show "Get started as solo" vs "Invite your team" and avoid showing invite UI to clearly solo users. |
| **Product today (no billing)** | **No** | Current behavior is fine: everyone has an org; when they invite, they're a team. Organization page and roles already support multi-member. No code *must* change for solo vs team to work. |

**Summary:** Solo vs Team is **necessary** when you introduce billing (free solo vs paid team). Until then it's **optional** UX: you can add an explicit choice for clarity and future billing, or keep inferring "solo" as "one member" and "team" as "two or more."

---

## Recommended approach

1. **Before billing**
   - **Minimal:** Do nothing. Keep inferring: solo = 1 member, team = 2+. Optionally set `organizations.type` to `"team"` when the second member joins (for future billing).
   - **Optional polish:** Add one step in onboarding or Settings: "Use PushLog for yourself (Solo) or with a team (Team)?" Store on org: `organizations.type` = `"solo"` or `"team"`. Use it to show/hide "Invite" and Organization prominence; keep backend logic the same.

2. **When you add billing**
   - If you didn't add an explicit choice: treat orgs with 1 member as solo (free), 2+ as team (paid). First invite can trigger "Add team plan" or similar.
   - If you did add Solo/Team: gate "team" features (or "team" orgs) on a paid plan; leave "solo" free.

3. **Existing users**
   - Stay as-is: 1 member = solo, 2+ = team. If you add an explicit type later, backfill from `memberCount` or leave default `"solo"` and let them switch in Settings.

---

## Current code (for reference)

- **Schema:** `organizations.type` exists, always `"solo"`; not read at runtime (see `shared/schema.ts`, `server/database.ts`).
- **UI:** Organization page uses `memberCount <= 1` to hide incident-targeting block ("solo" = no need to choose who gets alerts). No separate "Solo vs Team" screen.
- **To implement explicit choice:** Add a step (signup or Settings) that sets `organizations.type`; optionally show/hide or reorder "Organization" and "Invite" based on it. No backend permission change required unless you add billing.

---

*See also:* [ROADMAP.md](ROADMAP.md) → Teams & organization model → Account type at launch; [PLAN_TODAY.md](PLAN_TODAY.md) → Billing (future).
