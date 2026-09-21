import { NextResponse } from 'next/server';
import { compressPdf } from '@/lib/converter/compress';
import { assertFileSizeAllowed, assertExtensionMatchesMimetype, FileTooLargeError, InvalidFileTypeError } from '@/lib/converter/validation';
import { enforceConversionLimit } from '@/lib/rateLimit';
import { ConversionServiceError, InvalidFileError } from '@/lib/pythonService';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await enforceConversionLimit(request);
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get('file');
  const level = formData.get('level');

  if (!(file instanceof File) || file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'A valid PDF file is required.' }, { status: 400 });
  }
  try {
    assertFileSizeAllowed(file.type, file.size);
    assertExtensionMatchesMimetype(file.name, file.type);
  } catch (error) {
    if (error instanceof FileTooLargeError || error instanceof InvalidFileTypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const result = await compressPdf(inputBuffer, typeof level === 'string' ? level : 'recommended');

    return new Response(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Compressed.pdf"',
        'X-Before-Size': String(result.beforeSize),
        'X-After-Size': String(result.afterSize),
        'Access-Control-Expose-Headers': 'Content-Disposition, X-Before-Size, X-After-Size',
      },
    });
  } catch (error) {
    if (error instanceof ConversionServiceError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof InvalidFileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Compression error:', error);
    const message = error instanceof Error ? error.message : 'Failed to compress PDF';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
