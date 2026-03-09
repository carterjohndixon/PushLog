# Plan today

**Date:** 2026-03-04  
**Source of truth for status:** [ROADMAP.md](ROADMAP.md)

This doc turns every **TODO** from the ROADMAP into a concrete, pickable task. Use it to choose what to work on next.

---

## ROADMAP TODOs (all remaining work)

| # | ROADMAP item | Status | Where / what |
|---|--------------|--------|--------------|
| 1 | **Stack trace: strip Node internals** | Done | `isNodeInternalPath` + `isAppStackFrame` in `server/helper/stackTraceBundled.ts`; used in sentryWebhook.ts and routes.ts. Test: Settings → Developer mode → Incident Test → **Test stack filter API** (verified). |
| 2 | **Sentry per-app webhook URLs** | Done | Settings → Sentry webhooks: create app (name, appUrl), get unique URL + secret. Each app has its own webhook; all do the same processing. Replaces old single global URL. See SENTRY_SETUP.md. |
| 3 | **Solo vs Team choice** | TODO | Account type UI exists in Settings (Solo vs Organization). Remaining: explicit account type at signup/onboarding so new users choose Solo vs Team at launch. See ROADMAP → Teams & organization model. |
| 4 | **Billing (team/seat)** | TODO | Not in code. See ROADMAP → Billing (future consideration). Decide model (e.g. free solo + paid teams) before implementing. |

---

## Quick TODO (recommended next)

~~**Stack trace: strip Node internals**~~ — **Done.** App stack traces and incident emails exclude `node_modules` and Node built-ins (`node:*`) via `isAppStackFrame()`. Verified via Settings → Developer mode → **Test stack filter API**.

---

## Solo vs Team choice (when you’re ready)

- **Goal:** At signup (or account setup), user chooses **Solo** vs **Team**. Solo = current per-user experience. Team = full team model (invites, roles, shared visibility).
- **Current:** Account type UI exists in Settings (Solo vs Organization); everyone has an org. Block switch to Solo when multiple members.
- **To do:** Add account-type step to signup/onboarding so new users choose Solo vs Team at launch. Existing users stay solo or opt in to create a team. See ROADMAP → Teams & organization model → "Account type at launch".

---

## Billing (future)

- **Goal:** Monetization when ready (e.g. free solo, fixed price per team).
- **Current:** App is free; no billing in code.
- **To do:** Decide model (see ROADMAP → Billing); then implement (plans, seats, payment provider). Not scheduled.

---

## Recently completed (for reference)

| Item | Notes |
|------|--------|
| **Stack trace: strip Node internals** | `isNodeInternalPath()` + `isAppStackFrame()` in `server/helper/stackTraceBundled.ts`; used in sentryWebhook.ts and routes.ts. Incident stack traces and emails exclude `node_modules` and `node:*` frames. Verified via Settings → **Test stack filter API**. |
| GitHub org sync | Backend APIs + routes, Organization page "Invite from GitHub org", modal flow. ROADMAP updated. |
| Header scrollbar | Hide scrollbar, keep header scrollable (CSS). |
| Incident notification targeting | Phase 2 done. `organization_incident_settings`, targeting modes, UI on Organization page. |
| Frontend source maps in Sentry | Vite plugin uploads source maps; release aligned via `VITE_SENTRY_RELEASE`; see SENTRY_SETUP.md and SENTRY_SOURCEMAP_DEBUG.md. |

---

## Summary

**Next up:** Solo vs Team choice at signup (account-type UI already in Settings).
**Then:** Billing (after product/model is decided).
