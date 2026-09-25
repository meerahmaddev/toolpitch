import { NextResponse } from 'next/server';
import axios from 'axios';
import mime from 'mime-types';
import { getUserEmailOrGuest } from '@/lib/auth/session';
import { generateStoredFilename, uploadAndSaveFile } from '@/lib/converter/saveFileRecord';
import { processFile, ConversionFailedError, UnsupportedToolError } from '@/lib/converter/processFile';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'upload-drive', limit: 2, windowSeconds: 60 });
  if (limited) return limited;

  const body = await request.json();
  const { fileId, filename, oauthToken, mimeType, toolId } = body ?? {};

  if (!fileId || !oauthToken) {
    return NextResponse.json({ message: 'fileId and oauthToken are required' }, { status: 400 });
  }

  try {
    const response = await axios({
      method: 'GET',
      url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      headers: { Authorization: `Bearer ${oauthToken}` },
      responseType: 'arraybuffer',
      timeout: 20000,
    });

    const contentType = response.headers['content-type'] as string | undefined;
    const cleanType = (mimeType || contentType || '').split(';')[0].trim();
    const ext = mime.extension(cleanType) || (filename?.split('.').pop() ?? 'bin');

    const rawBuffer = Buffer.from(response.data);
    const userEmail = await getUserEmailOrGuest(request);

    // With a toolId, convert the downloaded file through the same pipeline as
    // process/process-url instead of saving it raw — this is what lets
    // "From Google Drive" on a tool page actually run that tool's conversion.
    if (toolId) {
      const processed = await processFile(rawBuffer, filename || `file.${ext}`, toolId);
      const uniqueFilename = generateStoredFilename(processed.cleanName, 'drive');

      const newFile = await uploadAndSaveFile({
        buffer: processed.buffer,
        originalName: processed.cleanName,
        filename: uniqueFilename,
        size: processed.buffer.length,
        mimetype: processed.mimetype,
        userEmail,
      });

      return NextResponse.json({
        message: 'File converted successfully',
        file: {
          _id: newFile._id,
          filename: newFile.filename,
          originalName: newFile.originalName,
          size: newFile.size,
          mimetype: newFile.mimetype,
        },
      });
    }

    const uniqueFilename = generateStoredFilename(`file.${ext}`, 'drive');
    const newFile = await uploadAndSaveFile({
      buffer: rawBuffer,
      originalName: filename || uniqueFilename,
      filename: uniqueFilename,
      size: rawBuffer.length,
      mimetype: cleanType,
      userEmail,
    });

    return NextResponse.json({
      message: 'File downloaded from Drive successfully',
      file: {
        _id: newFile._id,
        filename: newFile.filename,
        originalName: newFile.originalName,
        size: newFile.size,
        mimetype: newFile.mimetype,
      },
    });
  } catch (error) {
    if (error instanceof UnsupportedToolError || error instanceof ConversionFailedError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 403 || status === 401) {
      return NextResponse.json(
        { message: 'Access Denied. Make sure you have permission to download this file.' },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message: `Failed to fetch file from Google Drive: ${message}` }, { status: 400 });
  }
}
