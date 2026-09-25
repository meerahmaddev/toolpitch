import { NextResponse } from 'next/server';
import { getUserEmailOrGuest } from '@/lib/auth/session';
import { assertFileSizeAllowed, assertExtensionMatchesMimetype, FileTooLargeError, InvalidFileTypeError, MAX_UPLOAD_SIZE_BYTES } from '@/lib/converter/validation';
import { generateStoredFilename, uploadAndSaveFile } from '@/lib/converter/saveFileRecord';
import { rateLimitOrThrow } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await rateLimitOrThrow(request, { keyPrefix: 'upload', limit: 2, windowSeconds: 60 });
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'No file uploaded or file rejected by limits.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ message: 'No file uploaded or file rejected by limits.' }, { status: 400 });
  }

  try {
    assertFileSizeAllowed(file.type, file.size);
    assertExtensionMatchesMimetype(file.name, file.type);
  } catch (error) {
    if (error instanceof FileTooLargeError || error instanceof InvalidFileTypeError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }

  const userEmail = await getUserEmailOrGuest(request);
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = generateStoredFilename(file.name);

  const newFile = await uploadAndSaveFile({
    buffer,
    originalName: file.name,
    filename,
    size: file.size,
    mimetype: file.type,
    userEmail,
  });

  return NextResponse.json({
    message: 'File uploaded successfully',
    file: {
      _id: newFile._id,
      filename: newFile.filename,
      originalName: newFile.originalName,
      size: newFile.size,
      mimetype: newFile.mimetype,
    },
  });
}
