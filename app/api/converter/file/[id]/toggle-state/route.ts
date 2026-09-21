import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { File } from '@/lib/models/file.model';
import { requireSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const updates = await request.json();

  await connectToDatabase();
  const file = await File.findOneAndUpdate(
    { _id: id, userEmail: user.email },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!file) {
    return NextResponse.json({ message: 'File not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'File updated', file });
}
