/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When false-ish, hide Billing, plan renewal UI, and Stripe pricing flows (see `lib/payingUi.ts`). */
  readonly VITE_IS_PAYING_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
