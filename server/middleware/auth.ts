import { Request, Response, NextFunction } from 'express';
import { databaseStorage } from '../database';

/**
 * Build session user with org + role when user has organizationId and active membership.
 * Use after login to cache full session and avoid extra DB on first request.
 */
export async function getSessionUserWithOrg(user: {
  id: string;
  username: string | null;
  email: string | null;
  githubId?: string | null;
  googleId?: string | null;
  emailVerified?: boolean;
}): Promise<SessionUser | null> {
  const orgId = (user as any).organizationId;
  if (!orgId) return null;
  const membership = await databaseStorage.getMembershipByOrganizationAndUser(orgId, user.id);
  if (!membership || (membership as any).status !== 'active') return null;
  const role = ((membership as any).role === 'owner' || (membership as any).role === 'admin' || (membership as any).role === 'developer' || (membership as any).role === 'viewer')
    ? (membership as any).role
    : 'viewer';
  return {
    userId: user.id,
    username: user.username || '',
    email: user.email || null,
    githubConnected: !!user.githubId,
    googleConnected: !!user.googleId,
    emailVerified: !!user.emailVerified,
    organizationId: orgId,
    role,
  };
}

/**
 * Session-based user data structure
 * This replaces the JWT payload and is stored in req.session
 */
export interface SessionUser {
  userId: string;
  username: string;
  email: string | null;
  githubConnected: boolean;
  googleConnected: boolean;
  emailVerified: boolean;
  organizationId: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/** Require session with userId and mfaPending — for MFA setup/verify routes only. */
export function requireMfaPendingSession(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId || !(req.session as any).mfaPending) {
    return res.status(401).json({
      error: "Session expired or invalid. Please log in again.",
      code: "session_expired",
    });
  }
  next();
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    // Check if cookies are present - if not, session can't be read
    const hasCookies = !!req.headers.cookie;
    
    // Check if session exists and has userId
    // Express automatically reads the HTTP-only cookie and populates req.session
    // Note: req.session might exist even without cookies (empty session object)
    if (!req.session || !req.session.userId) {
      // Only log if it's not a public endpoint to reduce noise
      if (!req.path.includes('/health') && !req.path.includes('/api/notifications/stream')) {
        console.error('❌ Auth failed:', {
          hasSession: !!req.session,
          hasUserId: !!req.session?.userId,
          cookies: hasCookies ? 'present' : 'missing',
          sessionId: req.session?.id,
          path: req.path,
          // Check if session cookie specifically is missing
          hasSessionCookie: hasCookies && req.headers.cookie?.includes('connect.sid')
        });
      }
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // MFA: if first factor passed but MFA not complete, reject with specific code for client redirect
    if ((req.session as any).mfaPending) {
      const setupRequired = !!(req.session as any).mfaSetupRequired;
      return res.status(403).json({
        error: 'MFA required',
        needsMfaSetup: setupRequired,
        needsMfaVerify: !setupRequired,
        redirectTo: setupRequired ? '/setup-mfa' : '/verify-mfa',
      });
    }

    // Refresh session expiration (rolling sessions - resets expiration on activity)
    // This keeps the session alive as long as the user is making requests
    // IMPORTANT: We need to modify the session to force Express-session to send the cookie
    // Just calling touch() doesn't mark it as modified, so the cookie won't be sent on 304 responses
    if (req.session) {
      // Touch the session to update expiration
      req.session.touch();
      // Modify a property to force Express-session to send the cookie
      // This ensures the cookie is sent even on 304 Not Modified responses
      (req.session as any).lastActivity = Date.now();
    }

    // If we already have user data in session (with org + role), use it (faster, no DB query)
    // Otherwise, fetch from database and resolve membership
    const su = req.session.user;
    if (su && typeof (su as any).organizationId === 'string' && (su as any).organizationId !== '' && typeof (su as any).role === 'string') {
      req.user = req.session.user as SessionUser;
      next();
      return;
    }

    // Fetch user from database to populate session data
    // This happens on first request after login, then we cache it in session
    const user = await databaseStorage.getUser(req.session.userId);
    if (!user) {
      // User was deleted but session still exists - destroy session
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found' });
    }

    const orgId = (user as any).organizationId;
    if (!orgId || orgId === '') {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Account not fully set up. Please log in again.' });
    }

    const membership = await databaseStorage.getMembershipByOrganizationAndUser(orgId, user.id);
    if (!membership) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Membership not found' });
    }

    if ((membership as any).status === 'pending') {
      return res.status(403).json({
        error: 'Pending invite',
        code: 'pending_invite',
        message: 'You have a pending team invite. Accept it to continue.',
      });
    }

    const role = ((membership as any).role === 'owner' || (membership as any).role === 'admin' || (membership as any).role === 'developer' || (membership as any).role === 'viewer')
      ? (membership as any).role
      : 'viewer';

    // Build session user object (same structure as old JWT payload)
    const sessionUser: SessionUser = {
      userId: user.id,
      username: user.username || '',
      email: user.email || null,
      githubConnected: !!user.githubId,
      googleConnected: !!user.googleId,
      emailVerified: !!user.emailVerified,
      organizationId: orgId,
      role,
    };

    // Cache user data in session to avoid DB queries on subsequent requests
    req.session.user = sessionUser;
    req.user = sessionUser;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
  }
}

export function requireEmailVerification(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!req.user.emailVerified) {
    return res.status(403).json({ 
      error: 'Email verification required',
      message: 'Please verify your email address to access this feature'
    });
  }

  next();
} 