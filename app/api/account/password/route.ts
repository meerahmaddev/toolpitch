import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireSessionUser } from '@/lib/auth/session';
import { findUserByEmail, updateUserPassword } from '@/lib/auth/users';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'account-password', limit: 5, windowSeconds: 60 });
  if (limited) return limited;

  const user = await requireSessionUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const { currentPassword, newPassword } = body ?? {};

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ message: 'Current and new password are required' }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ message: 'New password must be at least 6 characters' }, { status: 400 });
  }

  const dbUser = await findUserByEmail(user.email);
  if (!dbUser) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  const isMatch = await bcrypt.compare(currentPassword, dbUser.passwordHash);
  if (!isMatch) {
    return NextResponse.json({ message: 'Current password is incorrect' }, { status: 401 });
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);
  await updateUserPassword(user.email, passwordHash);

  return NextResponse.json({ message: 'Password updated successfully' });
}
