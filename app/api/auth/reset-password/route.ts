import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { assertValidOtp, clearOtp, ExpiredOtpError, InvalidOtpError } from '@/lib/auth/otp';
import { updateUserPassword } from '@/lib/auth/users';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'reset-password', limit: 5, windowSeconds: 60 });
  if (limited) return limited;

  const body = await request.json();
  const { email, code, newPassword } = body ?? {};

  try {
    await assertValidOtp(email, code);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await updateUserPassword(email, passwordHash);
    await clearOtp(email);

    return NextResponse.json({ message: 'Password reset successfully' });
  } catch (error) {
    if (error instanceof InvalidOtpError || error instanceof ExpiredOtpError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: 'Password reset failed' }, { status: 500 });
  }
}
