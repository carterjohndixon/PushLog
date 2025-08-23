import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader, type JWTPayload } from '../jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.error('No authorization header present');
      console.log('Request headers:', req.headers);
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      console.error('No token found in authorization header');
      return res.status(401).json({ error: 'No token found' });
    }

    try {
      const user = verifyToken(token);
      req.user = user;
      next();
    } catch (verifyError) {
      console.error('Token verification failed:', verifyError);
      return res.status(401).json({ error: 'Invalid token' });
    }
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