import { NextResponse } from 'next/server';
import axios from 'axios';
import { connectToDatabase } from '@/lib/db';
import { File } from '@/lib/models/file.model';
import { generateSignedUrl } from '@/lib/cloudinary';
import { getSessionUser, GUEST_EMAIL } from '@/lib/auth/session';
import { generatePdfThumbnail } from '@/lib/converter/pdfThumbnail';
import { generateOfficeThumbnail } from '@/lib/converter/officeThumbnail';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

// PDFs and Office documents need server-side thumbnail generation (Cloudinary stores
// every file as a 'raw' resource, so its own image-transform URLs don't apply). Images
// are thumbnailed directly via the existing download route (?inline=true) instead.
const OFFICE_EXTENSIONS: Record<string, string> = {
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'thumbnail', limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const { filename } = await params;

  await connectToDatabase();
  const fileRecord = await File.findOne({ filename });

  if (!fileRecord || fileRecord.isDeleted) {
    return NextResponse.json({ message: 'File not found or unauthorized' }, { status: 404 });
  }

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
    return NextResponse.json({ message: 'File is not available in cloud storage.' }, { status: 404 });
  }
  const isPdf = fileRecord.mimetype === 'application/pdf';
  const officeExt = OFFICE_EXTENSIONS[fileRecord.mimetype];

  if (!isPdf && !officeExt) {
    return NextResponse.json({ message: 'Thumbnails are only available for PDF and Office documents.' }, { status: 404 });
  }

  try {
    const signedUrl = generateSignedUrl(fileRecord.cloudinaryPublicId, fileRecord.resourceType);
    const response = await axios({ method: 'GET', url: signedUrl, responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(response.data);

    const thumbnailBuffer = isPdf
      ? await generatePdfThumbnail(fileBuffer)
      : await generateOfficeThumbnail(fileBuffer, officeExt);

    return new Response(new Uint8Array(thumbnailBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Thumbnail generation error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ message: 'Failed to generate thumbnail.' }, { status: 404 });
  }
}
