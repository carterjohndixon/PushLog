import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: number;  // Quick access to user ID
    user?: {
      userId: number;
      username: string;
      email: string | null;
      githubConnected: boolean;
      googleConnected: boolean;
      emailVerified: boolean;
    };
  }
} 