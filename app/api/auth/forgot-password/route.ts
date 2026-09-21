import { NextResponse } from 'next/server';
import { findUserByEmail } from '@/lib/auth/users';
import { generateAndSendOtp } from '@/lib/auth/otp';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'forgot-password', limit: 5, windowSeconds: 60 });
  if (limited) return limited;

  const body = await request.json();
  const { email } = body ?? {};

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 });
  }

  // Always respond the same way whether or not the account exists, so this
  // endpoint can't be used to check which emails are registered. Only send
  // the OTP for real accounts.
  const user = await findUserByEmail(email);
  if (user) {
    await generateAndSendOtp(email);
  }
  return NextResponse.json({ message: 'If an account exists for that email, a code has been sent.' });
}
