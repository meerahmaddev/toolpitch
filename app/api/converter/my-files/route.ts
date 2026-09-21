import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { File } from '@/lib/models/file.model';
import { requireSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await requireSessionUser(request);
  if (user instanceof NextResponse) return user;

  await connectToDatabase();
  const files = await File.find({ userEmail: user.email }).sort({ createdAt: -1 }).exec();
  return NextResponse.json({ files });
}
