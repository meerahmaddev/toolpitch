import { NextResponse } from 'next/server';
import axios from 'axios';
import { Readable } from 'stream';
import { connectToDatabase } from '@/lib/db';
import { File } from '@/lib/models/file.model';
import { generateSignedUrl } from '@/lib/cloudinary';
import { getSessionUser, GUEST_EMAIL } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const inline = new URL(request.url).searchParams.get('inline') === 'true';

  await connectToDatabase();
  const fileRecord = await File.findOne({ filename });

  if (!fileRecord || fileRecord.isDeleted) {
    return NextResponse.json({ message: 'File not found or unauthorized' }, { status: 404 });
  }

  // Guest-owned files (anonymous conversions) stay downloadable without a
  // session, same as before — they're bounded by an unguessable filename and
  // the 8h expiry cron either way. Files owned by a real account now require
  // the matching session; this is the fix for the previous "no auth check at
  // all" hole.
  if (fileRecord.userEmail !== GUEST_EMAIL) {
    const user = await getSessionUser(request);
    if (!user || user.email !== fileRecord.userEmail) {
      return NextResponse.json({ message: 'File not found or unauthorized' }, { status: 401 });
    }
  }

  if (fileRecord.isExpired) {
    return NextResponse.json({ message: 'This file has expired and is no longer available.' }, { status: 404 });
  }
  if (!fileRecord.cloudinaryPublicId) {
    return NextResponse.json({ message: 'File is not available in storage.' }, { status: 404 });
  }

  const disposition = inline ? 'inline' : 'attachment';

  if (fileRecord.cloudinaryPublicId.startsWith('local:')) {
    const fs = await import('fs');
    const path = await import('path');
    const localFilePath = path.join(process.cwd(), 'public', 'uploads', fileRecord.filename);
    if (!fs.existsSync(localFilePath)) {
      return NextResponse.json({ message: 'File not found on local storage.' }, { status: 404 });
    }
    const fileStream = fs.createReadStream(localFilePath);
    const webStream = Readable.toWeb(fileStream) as ReadableStream;
    return new Response(webStream, {
      headers: {
        'Content-Type': fileRecord.mimetype || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${fileRecord.originalName}"`,
        'Content-Length': String(fileRecord.size),
      },
    });
  }

  const signedUrl = generateSignedUrl(fileRecord.cloudinaryPublicId, fileRecord.resourceType);

  try {
    const response = await axios({ method: 'GET', url: signedUrl, responseType: 'stream' });
    const webStream = Readable.toWeb(response.data) as ReadableStream;

    return new Response(webStream, {
      headers: {
        'Content-Type': fileRecord.mimetype || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${fileRecord.originalName}"`,
        'Content-Length': String(response.headers['content-length'] || fileRecord.size),
      },
    });
  } catch (error) {
    console.error('Cloudinary fetch error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ message: 'Failed to retrieve file from cloud storage.' }, { status: 404 });
  }
}
