import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;  // Quick access to user ID (UUID)
    mfaPending?: boolean;  // First factor passed, MFA setup or verify required before full auth
    mfaSetupRequired?: boolean;  // True when new user must set up MFA; false when returning user must verify
    mfaSetupSecret?: string;  // Temp TOTP secret during setup (cleared after save)
    user?: {
      userId: string;
      username: string;
      email: string | null;
      githubConnected: boolean;
      googleConnected: boolean;
      emailVerified: boolean;
      organizationId: string;
      role: 'owner' | 'admin' | 'developer' | 'viewer';
    };
  }
} 