import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { createUser, findUserByEmail, markUserAsVerified } from '@/lib/auth/users';
import { signAuthTokens } from '@/lib/auth/jwt';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'google-auth', limit: 15, windowSeconds: 60 });
  if (limited) return limited;

  const body = await request.json();
  const token = body?.token;

  if (!token) {
    return NextResponse.json({ message: 'No token provided' }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const client = new OAuth2Client(clientId);

  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: clientId });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return NextResponse.json({ message: 'Invalid Google token' }, { status: 401 });
    }

    let user = await findUserByEmail(payload.email);

    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-10) + 'Aa1@';
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(randomPassword, salt);
      user = await createUser(payload.email, passwordHash, payload.name || 'Google User');
      await markUserAsVerified(user.email);
    } else if (!user.isVerified) {
      await markUserAsVerified(user.email);
    }

    const tokens = signAuthTokens({ sub: String(user._id), email: user.email, name: user.fullName });

    return NextResponse.json({
      ...tokens,
      user: { email: user.email, name: user.fullName },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { message: `Failed to authenticate with Google: ${message}` },
      { status: 401 }
    );
  }
}
