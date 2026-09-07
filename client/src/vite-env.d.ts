/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When false-ish, hide Billing, plan renewal UI, and Stripe pricing flows (see `lib/payingUi.ts`). */
  readonly VITE_IS_PAYING_ENABLED?: string;
  /** When true-ish, show teams/orgs: /organization, invites, seats (see `lib/features.ts`). Off by default. */
  readonly VITE_ORGANIZATION_ON?: string;
  /** When true-ish, show incident reporting: PushLog agent, Sentry webhooks (see `lib/features.ts`). Off by default. */
  readonly VITE_INCIDENTS_ON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
