import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { assertFileSizeAllowed, assertExtensionMatchesMimetype, FileTooLargeError, InvalidFileTypeError } from '@/lib/converter/validation';
import { enforceConversionLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await enforceConversionLimit(request);
  if (limited) return limited;

  const formData = await request.formData();
  const files = formData.getAll('files').filter((f): f is File => f instanceof File);

  if (files.length < 2) {
    return NextResponse.json({ message: 'At least 2 PDF files are required to merge.' }, { status: 400 });
  }
  for (const f of files) {
    if (f.type !== 'application/pdf') {
      return NextResponse.json({ message: 'All files must be PDFs.' }, { status: 400 });
    }
    try {
      assertFileSizeAllowed(f.type, f.size);
      assertExtensionMatchesMimetype(f.name, f.type);
    } catch (error) {
      if (error instanceof FileTooLargeError || error instanceof InvalidFileTypeError) {
        return NextResponse.json({ message: error.message }, { status: 400 });
      }
      throw error;
    }
  }

  try {
    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        // Page data (getPageIndices, page count, ...) is lazily computed on first
        // access rather than eagerly during load() - a malformed-but-parseable file
        // can pass load() cleanly and only blow up here on that first real access, so
        // both calls have to share this same try/catch to actually catch it.
        const pdf = await PDFDocument.load(buffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } catch (loadError) {
        // pdf-lib's PDFDocument.load throws a real `new EncryptedPDFError()` for
        // password-protected input, but that class extends the native Error via
        // tslib's ES5 `__extends` helper - calling `Error.call(this, msg)` there
        // returns a *new* plain Error object instead of initializing `this` in
        // place, so the thrown value silently loses the EncryptedPDFError
        // prototype (`instanceof EncryptedPDFError` is false, constructor.name is
        // "Error"). Matching the message text is the only reliable way to tell
        // encryption apart from every other kind of malformed/corrupt PDF - the
        // message itself is a stable, hardcoded string in pdf-lib, not something
        // that varies per file. Naming the offending file matters here since a
        // merge can involve several - without it, a user has to guess which one
        // of N files was the problem.
        const detail =
          loadError instanceof Error && loadError.message.includes('is encrypted')
            ? `"${file.name}" is password-protected. Please remove the password (e.g. via your PDF viewer's "Print to PDF" or a password-removal tool) and try again.`
            : `"${file.name}" doesn't look like a valid PDF file. It may be corrupted or not actually a PDF - please check the file and try again.`;
        return NextResponse.json({ message: detail }, { status: 400 });
      }
    }

    const pdfBytes = await mergedPdf.save();

    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Merged_Document_${Date.now()}.pdf"`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
      },
    });
  } catch (error) {
    // Anything else here (page-copying/saving failures) is an unexpected internal
    // problem, not a user-fixable input issue - log the real cause server-side and
    // keep the client message generic and safe rather than echoing a raw library error.
    console.error('Merge PDF error:', error);
    return NextResponse.json({ message: 'Failed to merge PDFs. Please try again.' }, { status: 500 });
  }
}
