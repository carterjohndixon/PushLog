# Plan today

**Date:** 2025-03-01

---

## 1. GitHub Org sync

**Goal:** Let an admin/owner invite their whole team from the PushLog Organization page by syncing from a GitHub organization—when their GitHub account is connected.

### Behavior

- User is part of a **GitHub organization** and has their **GitHub account connected** in PushLog.
- On the **Organization** page in PushLog, an **owner or admin** sees an option to **invite from GitHub org** (or similar).
- Flow:
  1. Admin/owner chooses to “Invite from GitHub org” (or “Sync from GitHub”).
  2. PushLog uses the user’s GitHub token to list **organizations** they belong to (and optionally list **members** of a chosen org).
  3. Admin selects a GitHub org and sees which org members are **not yet** in the PushLog organization.
  4. Admin can invite those GitHub users (by GitHub username/email) to the PushLog org—e.g. create invite links or email invites for them, or a bulk “invite all” with a default role.

### Requirements

- **GitHub account connected:** Only show the option when the acting user has a connected GitHub account (e.g. `githubId` / `githubToken` set).
- **Permission:** Only **owner** or **admin** of the PushLog organization can use this.
- **GitHub API:** Use the connected user’s token to call GitHub’s org list and org members APIs (with correct scopes, e.g. `read:org`).
- **UI:** Organization page in PushLog; entry point like “Invite from GitHub org” that opens a flow to pick org → see members → invite (with default role).

### Implementation notes

- **APIs to use:**  
  - List user’s orgs: `GET /user/orgs`.  
  - List org members: `GET /orgs/:org/members` (and optionally `GET /orgs/:org/memberships` for role).  
  - Need to map GitHub login/email to “not already in PushLog org” (match by GitHub username or email if we store it).
- **Invite path:** Reuse existing “invite by link” or “invite by email” where possible; for GitHub users we may only have login/avatar; invite link by email if we have it, or show “share this link” for users we can’t email.
- **Scopes:** Ensure GitHub OAuth app has `read:org` (and any member read) so we can list orgs and members.

### Tasks (high level)

1. **Backend:** GitHub API helpers — list user’s orgs, list org members (and optionally roles).
2. **Backend:** Route(s) — e.g. `GET /api/org/github-orgs`, `GET /api/org/github-orgs/:orgLogin/members` (with auth + requireOrgRole owner/admin).
3. **Backend:** Decide invite strategy — create invite links for each selected member, or one “join” link with role; handle case where we only have GitHub username (no email).
4. **Client:** Organization page — add “Invite from GitHub org” (only if user has GitHub connected and is owner/admin).
5. **Client:** Flow — select GitHub org → list members not in PushLog org → select members + default role → create invites (links or email).
6. **Docs/ROADMAP:** Update ROADMAP “GitHub org sync” from TODO to in progress / done when shipped.

---

## 2. Header scrollbar quick fix

**Problem:** When the viewport isn’t wide enough, the header shows a horizontal scrollbar, which looks awkward.

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A. Smaller-width scrollbar** | Scrollbar still visible so users know they can scroll. | Still uses space; can look inconsistent across browsers/OS. |
| **B. Hide scrollbar, keep scrollable** | No visual clutter; header stays one “row”; users can still scroll with trackpad/mouse wheel or touch. | Some users might not discover horizontal scroll (usually fine for nav). |

**Recommendation:** **B — hide the scrollbar but keep the header scrollable.**

- Use `overflow-x: auto` (or `scroll`) so the header still scrolls on narrow viewports.
- Hide the scrollbar with CSS:
  - `scrollbar-width: none` (Firefox)
  - `-ms-overflow-style: none` (IE/old Edge)
  - `&::-webkit-scrollbar { display: none }` (Chrome, Safari, new Edge)
- Result: clean single-row header; no visible scrollbar; scroll still works. This is a common pattern for nav bars.

**Task:** Apply the above to the header component (or wrapper) so the scrollbar is hidden but horizontal scroll remains.

---

## Summary

| # | Item | Owner | Notes |
|---|------|--------|--------|
| 1 | GitHub Org sync — backend APIs + routes | — | List orgs, list members, create invites from GitHub org. |
| 2 | GitHub Org sync — Organization page UI + flow | — | “Invite from GitHub org” when GitHub connected + owner/admin. |
| 3 | Header scrollbar — hide scrollbar, keep scrollable | — | CSS on header so no visible scrollbar. |
