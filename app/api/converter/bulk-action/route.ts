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

  const body = await request.json();
  const { action, ids, projectId } = body ?? {};

  if (!ids || ids.length === 0) {
    return NextResponse.json({ message: 'No IDs provided' }, { status: 400 });
  }

  await connectToDatabase();

  if (action === 'permanent-delete') {
    const files = await File.find({ _id: { $in: ids }, userEmail: user.email });
    for (const file of files) {
      if (file.cloudinaryPublicId) {
        try {
          await deleteCloudinaryFile(file.cloudinaryPublicId, file.resourceType);
        } catch (e) {
          console.error('Failed to delete from Cloudinary:', e);
        }
      }
    }
    await File.deleteMany({ _id: { $in: ids }, userEmail: user.email });
    return NextResponse.json({ message: 'Files permanently deleted' });
  }

  let update: Record<string, unknown> = {};
  if (action === 'delete') update = { isDeleted: true };
  else if (action === 'restore') update = { isDeleted: false };
  else if (action === 'star') update = { isStarred: true };
  else if (action === 'unstar') update = { isStarred: false };
  else if (action === 'pin') update = { isPinned: true };
  else if (action === 'unpin') update = { isPinned: false };
  else if (action === 'project') {
    if (!projectId) {
      return NextResponse.json({ message: 'projectId required for this action' }, { status: 400 });
    }
    update = { projectId };
  } else if (action === 'remove-project') update = { projectId: null };

  await File.updateMany({ _id: { $in: ids }, userEmail: user.email }, { $set: update });

  return NextResponse.json({ message: `Bulk ${action} successful` });
}
