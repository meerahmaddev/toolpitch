import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { File } from '@/lib/models/file.model';
import { Project } from '@/lib/models/project.model';
import { requireSessionUser } from '@/lib/auth/session';
import { deleteUser } from '@/lib/auth/users';
import { deleteCloudinaryFile } from '@/lib/cloudinary';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function DELETE(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'account-delete', limit: 5, windowSeconds: 60 });
  if (limited) return limited;

  const user = await requireSessionUser(request);
  if (user instanceof NextResponse) return user;

  await connectToDatabase();

  const files = await File.find({ userEmail: user.email });
  for (const file of files) {
    if (file.cloudinaryPublicId) {
      try {
        await deleteCloudinaryFile(file.cloudinaryPublicId, file.resourceType);
      } catch (e) {
        console.error('Failed to delete from Cloudinary:', e);
      }
    }
  }

  await File.deleteMany({ userEmail: user.email });
  await Project.deleteMany({ userEmail: user.email });
  await deleteUser(user.email);

  return NextResponse.json({ message: 'Account deleted' });
}
