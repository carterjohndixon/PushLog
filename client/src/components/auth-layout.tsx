import * as React from "react";
import { ArrowLeft } from "lucide-react";

export interface AuthLayoutProps {
  children: React.ReactNode;
  /** Where the back link goes (e.g. "/" or "/login"). */
  backHref: string;
  /** Label for the back link (e.g. "Back to home" or "Back to login"). */
  backLabel: string;
  /** Optional footer line (e.g. for MFA pages: "PushLog · Two-factor authentication"). */
  footer?: React.ReactNode;
}

/**
 * Shared layout for auth pages (login, signup, verify-mfa, setup-mfa).
 * Minimal header with subtle back link top-left; reduced top space so the card sits higher.
 */
export function AuthLayout({ children, backHref, backLabel, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-forest-gradient">
      <header className="w-full shrink-0 border-b border-border/60 bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-4 sm:px-6">
          <a
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            {backLabel}
          </a>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pt-12 sm:pt-16 pb-8 sm:pb-12">
        <div className="w-full">
          {children}
        </div>
      </main>

      {footer ? (
        <footer className="w-full shrink-0 py-4 text-center text-sm text-muted-foreground">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
