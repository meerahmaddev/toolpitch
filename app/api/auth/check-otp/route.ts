import { NextResponse } from 'next/server';
import { assertValidOtp, ExpiredOtpError, InvalidOtpError } from '@/lib/auth/otp';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';

// Validates an OTP without consuming it (no clearOtp/markUserAsVerified side
// effects) — used by the forgot-password flow to confirm the code is right
// *before* the user moves on to setting a new password. reset-password still
// does the final authoritative check + clearOtp on submit.
export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'check-otp', limit: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = await request.json();
  const { email, code } = body ?? {};

  try {
    await assertValidOtp(email, code);
    return NextResponse.json({ message: 'OTP is valid' });
  } catch (error) {
    if (error instanceof InvalidOtpError || error instanceof ExpiredOtpError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: 'Verification failed' }, { status: 500 });
  }
}
