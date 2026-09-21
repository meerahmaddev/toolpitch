import { NextResponse } from 'next/server';
import axios from 'axios';
import mime from 'mime-types';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';

// Pasted URLs often don't end in a recognizable extension (redirects, query
// strings, CDN paths like /photos/abc123) - FileStagingZone's format dropdown
// falls back to a generic 3-format list when it can't read one off the
// filename. This endpoint reads the real Content-Type instead, without
// downloading the file, so the staging step can offer every format this app
// actually supports for that content.
export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'url-info', limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await request.json();
  const url = body?.url as string | undefined;

  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return NextResponse.json({ message: 'Valid HTTP/HTTPS URL is required.' }, { status: 400 });
  }

  let contentType: string | undefined;

  try {
    const head = await axios.head(url, { timeout: 8000, maxRedirects: 5 });
    contentType = head.headers['content-type'] as string | undefined;
  } catch {
    // Some servers don't support HEAD - fetch just the first byte instead of
    // the whole file to read the same header off a GET.
    try {
      const get = await axios.get(url, {
        timeout: 8000,
        maxRedirects: 5,
        responseType: 'stream',
        headers: { Range: 'bytes=0-0' },
      });
      contentType = get.headers['content-type'] as string | undefined;
      get.data.destroy();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ message: `Failed to inspect URL: ${message}` }, { status: 400 });
    }
  }

  const cleanType = contentType?.split(';')[0].trim() || null;
  const extension = cleanType
    ? (cleanType === 'image/heic' ? 'heic' : cleanType === 'image/heif' ? 'heif' : mime.extension(cleanType)) || null
    : null;

  return NextResponse.json({ contentType: cleanType, extension });
}
