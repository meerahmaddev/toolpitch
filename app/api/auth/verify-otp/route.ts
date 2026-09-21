import { NextResponse } from 'next/server';
import { assertValidOtp, clearOtp, ExpiredOtpError, InvalidOtpError } from '@/lib/auth/otp';
import { markUserAsVerified } from '@/lib/auth/users';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'verify-otp', limit: 5, windowSeconds: 60 });
  if (limited) return limited;

  const body = await request.json();
  const { email, code } = body ?? {};

  try {
    await assertValidOtp(email, code);
    await markUserAsVerified(email);
    await clearOtp(email);
    return NextResponse.json({ message: 'Email verified successfully' });
  } catch (error) {
    if (error instanceof InvalidOtpError || error instanceof ExpiredOtpError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: 'Verification failed' }, { status: 500 });
  }
}
