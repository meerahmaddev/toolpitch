import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import { findUserByEmail } from '@/lib/auth/users';

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
}

export const GUEST_EMAIL = 'guest@convertify.app';

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

/**
 * Mirrors JwtAuthGuard/OptionalJwtAuthGuard + JwtStrategy.validate: verifies the
 * bearer token, then re-checks the user still exists in the DB before trusting it.
 * Returns null on any failure (missing/invalid/expired token, or deleted user).
 */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  try {
    const payload = verifyToken(token);
    const user = await findUserByEmail(payload.email);
    if (!user) return null;
    return { userId: payload.sub, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

/** Matches the backend's `req?.user?.email || GUEST_EMAIL` fallback used on optionally-authed routes. */
export async function getUserEmailOrGuest(request: Request): Promise<string> {
  const user = await getSessionUser(request);
  return user?.email || GUEST_EMAIL;
}

/**
 * Matches JwtAuthGuard: returns the session user, or a ready-to-return 401 NextResponse.
 * Usage: `const user = await requireSessionUser(request); if (user instanceof NextResponse) return user;`
 */
export async function requireSessionUser(request: Request): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: 'Token missing, invalid, or expired' }, { status: 401 });
  }
  return user;
}
