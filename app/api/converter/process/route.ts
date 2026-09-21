import { NextResponse } from 'next/server';
import { getUserEmailOrGuest } from '@/lib/auth/session';
import { assertFileSizeAllowed, assertExtensionMatchesMimetype, FileTooLargeError, InvalidFileTypeError } from '@/lib/converter/validation';
import { generateStoredFilename, uploadAndSaveFile } from '@/lib/converter/saveFileRecord';
import { processFile, ConversionFailedError, UnsupportedToolError } from '@/lib/converter/processFile';
import { ConversionServiceError, InvalidFileError } from '@/lib/pythonService';
import { enforceConversionLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const limited = await enforceConversionLimit(request);
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get('file');
  const toolId = formData.get('toolId');

  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'No file uploaded or file rejected by limits.' }, { status: 400 });
  }
  if (typeof toolId !== 'string' || !toolId) {
    return NextResponse.json({ message: 'toolId is required' }, { status: 400 });
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

  try {
    const processed = await processFile(buffer, file.name, toolId);
    const filename = generateStoredFilename(processed.cleanName, 'processed');

    const newFile = await uploadAndSaveFile({
      buffer: processed.buffer,
      originalName: processed.cleanName,
      filename,
      size: processed.buffer.length,
      mimetype: processed.mimetype,
      userEmail,
    });

    return NextResponse.json({
      message: 'File processed successfully',
      file: {
        _id: newFile._id,
        filename: newFile.filename,
        originalName: newFile.originalName,
        size: newFile.size,
        mimetype: newFile.mimetype,
      },
      method: processed.method,
    });
  } catch (error) {
    if (error instanceof ConversionServiceError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }
    if (error instanceof UnsupportedToolError || error instanceof ConversionFailedError || error instanceof InvalidFileError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    // Anything else here (e.g. a Mongo/DNS outage from uploadAndSaveFile, which
    // needs a real DB record to make the file downloadable and so can't just
    // fail open like rate limiting does) would otherwise crash as an opaque,
    // blank 500 - log the real cause server-side and give the client a message.
    console.error('process route: unexpected failure:', error);
    return NextResponse.json(
      { message: 'Something went wrong while saving your converted file. Please try again shortly.' },
      { status: 500 }
    );
  }
}
