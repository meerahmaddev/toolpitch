import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { assertFileSizeAllowed, assertExtensionMatchesMimetype, FileTooLargeError, InvalidFileTypeError } from '@/lib/converter/validation';
import { enforceConversionLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

type PageSize = 'a4' | 'letter' | 'fit';
type Orientation = 'auto' | 'portrait' | 'landscape';
type Margin = 'none' | 'normal' | 'wide';

interface PdfOptions {
  pageSize: PageSize;
  orientation: Orientation;
  margin: Margin;
}

const MARGIN_POINTS: Record<Margin, number> = { none: 0, normal: 20, wide: 48 };
const BASE_PAGE_SIZE: Record<Exclude<PageSize, 'fit'>, [number, number]> = {
  a4: PageSizes.A4,
  letter: PageSizes.Letter,
};
const FIT_MAX_POINTS = 1000; // cap so a huge photo doesn't produce an absurdly large page

async function toJpegBuffer(inputBuffer: Buffer, originalName: string): Promise<Buffer> {
  const ext = (originalName.split('.').pop() || '').toLowerCase();
  let source = inputBuffer;

  if (ext === 'heic' || ext === 'heif') {
    const heicConvert = (await import('heic-convert')).default;
    source = Buffer.from(await heicConvert({ buffer: inputBuffer, format: 'JPEG', quality: 1 }));
  }

  return sharp(source)
    .rotate() // bake in EXIF orientation before the metadata (and the rotation hint with it) is dropped
    .flatten({ background: { r: 255, g: 255, b: 255 } }) // avoid sharp's default-black flatten on transparent PNGs
    .jpeg({ quality: 85 })
    .toBuffer();
}

function resolvePageDims(pageSize: PageSize, orientation: Orientation, margin: number, imgWidth: number, imgHeight: number): [number, number] {
  if (pageSize === 'fit') {
    const scale = Math.min(1, FIT_MAX_POINTS / Math.max(imgWidth, imgHeight));
    return [imgWidth * scale + margin * 2, imgHeight * scale + margin * 2];
  }

  const [baseW, baseH] = BASE_PAGE_SIZE[pageSize]; // portrait by default
  const isImageLandscape = imgWidth > imgHeight;
  const useLandscape = orientation === 'landscape' || (orientation === 'auto' && isImageLandscape);

  return useLandscape ? [baseH, baseW] : [baseW, baseH];
}

export async function POST(request: Request) {
  const limited = await enforceConversionLimit(request);
  if (limited) return limited;

  const formData = await request.formData();
  const files = formData.getAll('files').filter((f): f is File => f instanceof File);
  const optionsRaw = formData.get('options');

  let options: PdfOptions = { pageSize: 'a4', orientation: 'auto', margin: 'normal' };
  if (typeof optionsRaw === 'string' && optionsRaw) {
    try {
      const parsed = JSON.parse(optionsRaw);
      options = {
        pageSize: ['a4', 'letter', 'fit'].includes(parsed.pageSize) ? parsed.pageSize : 'a4',
        orientation: ['auto', 'portrait', 'landscape'].includes(parsed.orientation) ? parsed.orientation : 'auto',
        margin: ['none', 'normal', 'wide'].includes(parsed.margin) ? parsed.margin : 'normal',
      };
    } catch {
      // keep defaults on malformed options
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ message: 'At least 1 image is required to generate a PDF.' }, { status: 400 });
  }
  for (const f of files) {
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
    const pdfDoc = await PDFDocument.create();
    const marginPoints = MARGIN_POINTS[options.margin];

    for (const file of files) {
      const inputBuffer = Buffer.from(await file.arrayBuffer());
      const jpegBuffer = await toJpegBuffer(inputBuffer, file.name);
      const pdfImage = await pdfDoc.embedJpg(jpegBuffer);
      const { width, height } = pdfImage.scale(1);

      const [pageWidth, pageHeight] = resolvePageDims(options.pageSize, options.orientation, marginPoints, width, height);
      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      const maxWidth = pageWidth - marginPoints * 2;
      const maxHeight = pageHeight - marginPoints * 2;
      const scale = Math.min(maxWidth / width, maxHeight / height);
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;

      page.drawImage(pdfImage, {
        x: (pageWidth - scaledWidth) / 2,
        y: (pageHeight - scaledHeight) / 2,
        width: scaledWidth,
        height: scaledHeight,
      });
    }

    const pdfBytes = await pdfDoc.save();

    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Document_${Date.now()}.pdf"`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message: `Failed to generate PDF: ${message}` }, { status: 400 });
  }
}
