import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { ZipArchive } from 'archiver';
import { PassThrough } from 'stream';
import { assertFileSizeAllowed, assertExtensionMatchesMimetype, FileTooLargeError, InvalidFileTypeError } from '@/lib/converter/validation';
import { enforceConversionLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await enforceConversionLimit(request);
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get('file');
  const splitPointsStr = formData.get('splitPoints');

  if (!(file instanceof File) || file.type !== 'application/pdf') {
    return NextResponse.json({ message: 'A valid PDF file is required.' }, { status: 400 });
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

  let splitPoints: number[] = [];
  if (typeof splitPointsStr === 'string' && splitPointsStr) {
    try {
      splitPoints = JSON.parse(splitPointsStr);
    } catch {
      return NextResponse.json({ message: 'Invalid splitPoints format.' }, { status: 400 });
    }
  }

  let sourcePdf;
  let totalPages;
  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    // Page data (getPageCount, page indices, ...) is lazily computed on first access
    // rather than eagerly during load() - a malformed-but-parseable file can pass
    // load() cleanly and only blow up on that first real access, so both calls have
    // to share this one try/catch to actually catch it.
    sourcePdf = await PDFDocument.load(inputBuffer);
    totalPages = sourcePdf.getPageCount();
  } catch (loadError) {
    // pdf-lib's PDFDocument.load throws a real `new EncryptedPDFError()` for
    // password-protected input, but that class extends the native Error via
    // tslib's ES5 `__extends` helper - calling `Error.call(this, msg)` there returns
    // a *new* plain Error object instead of initializing `this` in place, so the
    // thrown value silently loses the EncryptedPDFError prototype (`instanceof
    // EncryptedPDFError` is false). Matching the message text is the only reliable
    // way to tell encryption apart from every other kind of malformed/corrupt PDF -
    // it's a stable, hardcoded string in pdf-lib, not something that varies per file.
    const detail =
      loadError instanceof Error && loadError.message.includes('is encrypted')
        ? 'This PDF is password-protected. Please remove the password (e.g. via your PDF viewer\'s "Print to PDF" or a password-removal tool) and upload it again.'
        : "This doesn't look like a valid PDF file. It may be corrupted or not actually a PDF - please check the file and try again.";
    return NextResponse.json({ message: detail }, { status: 400 });
  }

  try {
    // Number.isInteger guards against a crash if splitPoints ever contains a
    // non-integer (e.g. a float) - the normal UI only ever sends integers (they come
    // from page-boundary clicks), but this endpoint is reachable directly, and a
    // fractional split point turns into a fractional page range below, which pdf-lib
    // rejects.
    splitPoints = [...new Set(splitPoints)].filter((p) => Number.isInteger(p) && p > 0 && p < totalPages).sort((a, b) => a - b);

    const chunks: { start: number; end: number }[] = [];
    let currentStart = 0;
    for (const sp of splitPoints) {
      chunks.push({ start: currentStart, end: sp - 1 });
      currentStart = sp;
    }
    chunks.push({ start: currentStart, end: totalPages - 1 });

    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const passthrough = new PassThrough();
      const outChunks: Buffer[] = [];

      passthrough.on('data', (chunk: Buffer) => outChunks.push(chunk));
      passthrough.on('end', () => resolve(Buffer.concat(outChunks)));
      archive.on('error', reject);
      archive.pipe(passthrough);

      (async () => {
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const newPdf = await PDFDocument.create();
          const indicesToCopy: number[] = [];
          for (let p = chunk.start; p <= chunk.end; p++) indicesToCopy.push(p);

          const copiedPages = await newPdf.copyPages(sourcePdf, indicesToCopy);
          copiedPages.forEach((page) => newPdf.addPage(page));

          const pdfBytes = await newPdf.save();
          const chunkName =
            chunk.start === chunk.end
              ? `page_${chunk.start + 1}.pdf`
              : `pages_${chunk.start + 1}-${chunk.end + 1}.pdf`;

          archive.append(Buffer.from(pdfBytes), { name: chunkName });
        }
        await archive.finalize();
      })().catch(reject);
    });

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Split_PDFs_${Date.now()}.zip"`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
      },
    });
  } catch (error) {
    console.error('Error splitting PDF:', error);
    return NextResponse.json({ message: 'Failed to split PDF' }, { status: 500 });
  }
}
