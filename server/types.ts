import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;  // Quick access to user ID (UUID)
    user?: {
      userId: string;
      username: string;
      email: string | null;
      githubConnected: boolean;
      googleConnected: boolean;
      emailVerified: boolean;
    };
  }
} 