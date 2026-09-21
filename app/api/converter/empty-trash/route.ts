import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { File } from '@/lib/models/file.model';
import { requireSessionUser } from '@/lib/auth/session';
import { deleteCloudinaryFile } from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await requireSessionUser(request);
  if (user instanceof NextResponse) return user;

  await connectToDatabase();
  const files = await File.find({ userEmail: user.email, isDeleted: true });

  for (const file of files) {
    if (file.cloudinaryPublicId) {
      try {
        await deleteCloudinaryFile(file.cloudinaryPublicId, file.resourceType);
      } catch (e) {
        console.error('Failed to delete from Cloudinary:', e);
      }
    }
  }

  await File.deleteMany({ userEmail: user.email, isDeleted: true });
  return NextResponse.json({ message: 'Trash emptied' });
}
