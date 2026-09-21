import { NextResponse } from 'next/server';
import { findUserByEmail } from '@/lib/auth/users';
import { signAuthTokens, verifyToken } from '@/lib/auth/jwt';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'refresh', limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await request.json();
  const { refreshToken } = body ?? {};

  if (!refreshToken) {
    return NextResponse.json({ message: 'Refresh token is required' }, { status: 400 });
  }

  try {
    const payload = verifyToken(refreshToken);
    const user = await findUserByEmail(payload.email);
    if (!user) {
      return NextResponse.json({ message: 'Invalid or expired refresh token' }, { status: 401 });
    }

    const tokens = signAuthTokens({ sub: String(user._id), email: user.email, name: user.fullName });
    return NextResponse.json(tokens);
  } catch {
    return NextResponse.json({ message: 'Invalid or expired refresh token' }, { status: 401 });
  }
}
