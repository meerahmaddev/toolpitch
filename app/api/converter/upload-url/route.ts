import { NextResponse } from 'next/server';
import axios from 'axios';
import mime from 'mime-types';
import { getUserEmailOrGuest } from '@/lib/auth/session';
import { generateStoredFilename, uploadAndSaveFile } from '@/lib/converter/saveFileRecord';
import { assertExtensionMatchesMimetype, InvalidFileTypeError, MAX_UPLOAD_SIZE_BYTES } from '@/lib/converter/validation';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Downloads a file from a URL and saves it as-is (no conversion) — the
// "Paste URL" quick-save button. For "download a URL and convert it with a
// specific tool," see process-url/route.ts.
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'video/mp4', 'video/x-matroska', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
];

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'upload-url', limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await request.json();
  const fileUrl = body?.url as string | undefined;

  if (!fileUrl || (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://'))) {
    return NextResponse.json({ message: 'Valid HTTP/HTTPS URL is required.' }, { status: 400 });
  }

  try {
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream',
      timeout: 15000,
      maxRedirects: 5,
    });

    const contentType = response.headers['content-type'] as string | undefined;
    if (!contentType) {
      response.data.destroy();
      return NextResponse.json({ message: 'Content-Type header is missing from the URL response.' }, { status: 400 });
    }
    const cleanType = contentType.split(';')[0].trim();

    let maxBytes = MAX_UPLOAD_SIZE_BYTES;
    if (cleanType === 'application/pdf') maxBytes = 15 * 1024 * 1024;

    const contentLength = response.headers['content-length'] as string | undefined;
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      response.data.destroy();
      return NextResponse.json(
        { message: `File is too large! Maximum limit for this format is ${Math.round(maxBytes / 1024 / 1024)}MB.` },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(cleanType)) {
      response.data.destroy();
      return NextResponse.json({ message: `File type not supported: ${cleanType}` }, { status: 400 });
    }

    const ext =
      (cleanType === 'image/heic' ? 'heic' : cleanType === 'image/heif' ? 'heif' : mime.extension(cleanType)) || 'bin';
    const originalName = `downloaded_from_url.${ext}`;

    try {
      assertExtensionMatchesMimetype(originalName, cleanType);
    } catch (error) {
      if (error instanceof InvalidFileTypeError) {
        response.data.destroy();
        return NextResponse.json({ message: error.message }, { status: 400 });
      }
      throw error;
    }

    const buffer: Buffer = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let downloadedBytes = 0;

      response.data.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > maxBytes) {
          response.data.destroy();
          reject(new Error('File exceeded size limit during download.'));
          return;
        }
        chunks.push(chunk);
      });
      response.data.on('end', () => resolve(Buffer.concat(chunks)));
      response.data.on('error', reject);
    });

    const userEmail = await getUserEmailOrGuest(request);
    const filename = generateStoredFilename(originalName, 'downloaded');

    const newFile = await uploadAndSaveFile({
      buffer,
      originalName,
      filename,
      size: buffer.length,
      mimetype: cleanType,
      userEmail,
    });

    return NextResponse.json({
      message: 'File downloaded successfully',
      file: {
        _id: newFile._id,
        filename: newFile.filename,
        originalName: newFile.originalName,
        size: newFile.size,
        mimetype: newFile.mimetype,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message: `Failed to download file: ${message}` }, { status: 400 });
  }
}
