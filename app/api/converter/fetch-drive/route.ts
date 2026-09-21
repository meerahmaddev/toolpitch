import { NextResponse } from 'next/server';
import axios from 'axios';
import mime from 'mime-types';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'fetch-drive', limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  try {
    const body = await request.json();
    const { fileId, filename, oauthToken, mimeType } = body ?? {};

    if (!fileId || !oauthToken) {
      return NextResponse.json({ message: 'fileId and oauthToken are required' }, { status: 400 });
    }

    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    let effectiveMime = (mimeType || '').split(';')[0].trim();
    let effectiveName = filename || 'drive_file';

    // Handle native Google Docs, Sheets, Slides by exporting to standard formats
    if (effectiveMime === 'application/vnd.google-apps.document') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
      effectiveMime = 'application/pdf';
      if (!effectiveName.toLowerCase().endsWith('.pdf')) {
        effectiveName = `${effectiveName.replace(/\.[^/.]+$/, '')}.pdf`;
      }
    } else if (effectiveMime === 'application/vnd.google-apps.spreadsheet') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
      effectiveMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (!effectiveName.toLowerCase().endsWith('.xlsx')) {
        effectiveName = `${effectiveName.replace(/\.[^/.]+$/, '')}.xlsx`;
      }
    } else if (effectiveMime === 'application/vnd.google-apps.presentation') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.presentationml.presentation`;
      effectiveMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      if (!effectiveName.toLowerCase().endsWith('.pptx')) {
        effectiveName = `${effectiveName.replace(/\.[^/.]+$/, '')}.pptx`;
      }
    }

    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      headers: { Authorization: `Bearer ${oauthToken}` },
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const contentType = (response.headers['content-type'] as string | undefined) || effectiveMime || 'application/octet-stream';
    const ext = mime.extension(contentType) || (effectiveName.split('.').pop() ?? 'bin');
    if (!effectiveName.includes('.')) {
      effectiveName = `${effectiveName}.${ext}`;
    }

    const buffer = Buffer.from(response.data);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(effectiveName)}"`,
        'X-File-Name': encodeURIComponent(effectiveName),
        'X-File-Mime': contentType,
      },
    });
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 403 || status === 401) {
      return NextResponse.json(
        { message: 'Access Denied by Google Drive. Make sure you granted permission to access this file.' },
        { status: 400 }
      );
    }
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message: `Failed to fetch file from Google Drive: ${msg}` }, { status: 400 });
  }
}
