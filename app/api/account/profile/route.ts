import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/session';
import { updateUserName } from '@/lib/auth/users';
import { signAuthTokens } from '@/lib/auth/jwt';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'account-profile', limit: 10, windowSeconds: 60 });
  if (limited) return limited;

  const user = await requireSessionUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';

  if (!fullName) {
    return NextResponse.json({ message: 'Name is required' }, { status: 400 });
  }

  await updateUserName(user.email, fullName);

  // Re-sign tokens so the JWT's baked-in `name` claim stays truthful (see
  // lib/auth/session.ts — SessionUser.name comes from the token, not a fresh
  // DB read, on every request).
  const tokens = signAuthTokens({ sub: user.userId, email: user.email, name: fullName });

  return NextResponse.json({
    message: 'Profile updated successfully',
    ...tokens,
    user: { email: user.email, name: fullName },
  });
}
