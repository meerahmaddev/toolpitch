import { NextResponse } from 'next/server';
import axios from 'axios';
import { ZipArchive } from 'archiver';
import { PassThrough } from 'stream';
import { connectToDatabase } from '@/lib/db';
import { File } from '@/lib/models/file.model';
import { requireSessionUser } from '@/lib/auth/session';
import { generateSignedUrl } from '@/lib/cloudinary';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BULK_DOWNLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'bulk-download', limit: 15, windowSeconds: 60 });
  if (limited) return limited;

  const user = await requireSessionUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const { ids } = body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ message: 'No files selected.' }, { status: 400 });
  }

  await connectToDatabase();
  const files = await File.find({ _id: { $in: ids }, userEmail: user.email, isDeleted: false });

  if (files.length === 0) {
    return NextResponse.json({ message: 'No files found.' }, { status: 404 });
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_BULK_DOWNLOAD_BYTES) {
    return NextResponse.json(
      {
        message: `Selected files total ${(totalSize / 1024 / 1024).toFixed(1)}MB, which exceeds the ${MAX_BULK_DOWNLOAD_BYTES / 1024 / 1024}MB bulk download limit. Please select fewer files.`,
      },
      { status: 400 }
    );
  }

  const failed: { name: string; reason: string }[] = [];
  const fetched: { name: string; buffer: Buffer }[] = [];
  const usedNames = new Set<string>();

  for (const file of files) {
    if (!file.cloudinaryPublicId) {
      failed.push({ name: file.originalName, reason: 'File is not available in cloud storage.' });
      continue;
    }
    try {
      let fileBuffer: Buffer;
      if (file.cloudinaryPublicId.startsWith('local:')) {
        const fs = await import('fs');
        const path = await import('path');
        const localFilePath = path.join(process.cwd(), 'public', 'uploads', file.filename);
        fileBuffer = await fs.promises.readFile(localFilePath);
      } else {
        const signedUrl = generateSignedUrl(file.cloudinaryPublicId, file.resourceType);
        const response = await axios({ method: 'GET', url: signedUrl, responseType: 'arraybuffer', timeout: 20000 });
        fileBuffer = Buffer.from(response.data);
      }

      let name = file.originalName;
      if (usedNames.has(name)) {
        const dotIndex = name.lastIndexOf('.');
        const base = dotIndex === -1 ? name : name.slice(0, dotIndex);
        const ext = dotIndex === -1 ? '' : name.slice(dotIndex);
        name = `${base}_${file._id}${ext}`;
      }
      usedNames.add(name);

      fetched.push({ name, buffer: fileBuffer });
    } catch (error) {
      failed.push({ name: file.originalName, reason: error instanceof Error ? error.message : 'Failed to fetch file.' });
    }
  }

  if (fetched.length === 0) {
    return NextResponse.json({ message: 'None of the selected files could be prepared for download.' }, { status: 502 });
  }

  const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const passthrough = new PassThrough();
    const outChunks: Buffer[] = [];

    passthrough.on('data', (chunk: Buffer) => outChunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(outChunks)));
    archive.on('error', reject);
    archive.pipe(passthrough);

    for (const item of fetched) {
      archive.append(item.buffer, { name: item.name });
    }
    if (failed.length > 0) {
      const errorsText = failed.map((f) => `${f.name}: ${f.reason}`).join('\n');
      archive.append(Buffer.from(errorsText, 'utf-8'), { name: 'errors.txt' });
    }
    archive.finalize();
  });

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Bulk_Download_${Date.now()}.zip"`,
      'X-Bulk-Warnings': String(failed.length),
      'Access-Control-Expose-Headers': 'Content-Disposition, X-Bulk-Warnings',
    },
  });
}
