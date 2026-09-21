import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createUser, markUserAsVerified, UserAlreadyExistsError } from '@/lib/auth/users';
import { signAuthTokens } from '@/lib/auth/jwt';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'signup', limit: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = await request.json();
  const { email, password, fullName } = body ?? {};

  if (!email || !password || !fullName) {
    return NextResponse.json({ message: 'Name, email, and password are required' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ message: 'Password must be at least 6 characters' }, { status: 400 });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await createUser(email, passwordHash, fullName);
    await markUserAsVerified(email); // Auto-verify, same as current backend

    const tokens = signAuthTokens({ sub: String(user._id), email: user.email, name: user.fullName });

    return NextResponse.json({
      message: 'User created successfully.',
      ...tokens,
      user: { email: user.email, name: user.fullName },
    });
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    return NextResponse.json({ message: 'Signup failed' }, { status: 500 });
  }
}
