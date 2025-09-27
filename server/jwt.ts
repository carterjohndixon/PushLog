import jwt from 'jsonwebtoken';

// JWT secret must be provided via environment variable
const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const TOKEN_EXPIRY = '24h';

export interface JWTPayload {
  userId: number;
  username: string;
  email: string | null;
  githubConnected: boolean;
  googleConnected: boolean;
  emailVerified: boolean;
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

export function extractTokenFromHeader(header: string | undefined): string {
  if (!header) {
    throw new Error('No authorization header');
  }

  const [type, token] = header.split(' ');
  
  if (type !== 'Bearer') {
    throw new Error('Invalid token type');
  }

  return token;
} 