import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { File } from '@/lib/models/file.model';
import { deleteCloudinaryFile } from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Hit on a schedule by Vercel Cron (see vercel.json) since Vercel functions
// don't stay alive between requests, so there's no in-process scheduler.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  await connectToDatabase();

  // 24h (not 8h) because Vercel's Hobby plan only allows this cron to run
  // once/day - an 8h window would mean files could sit unexpired for up to
  // ~32h anyway, so a 24h window lines up with the actual run cadence.
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expiredFiles = await File.find({ createdAt: { $lt: twentyFourHoursAgo }, isExpired: false });

  let deletedCount = 0;
  for (const file of expiredFiles) {
    try {
      if (file.cloudinaryPublicId) {
        await deleteCloudinaryFile(file.cloudinaryPublicId, file.resourceType);
      }
      file.isExpired = true;
      await file.save();
      deletedCount++;
    } catch (err) {
      console.error(`Failed to delete expired file ${file._id}:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ message: 'Cleanup finished', deletedCount, found: expiredFiles.length });
}
