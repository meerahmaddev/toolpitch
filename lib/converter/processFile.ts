import sharp from 'sharp';
import path from 'path';
import PDFDocumentKit from 'pdfkit';
import { PDFDocument } from 'pdf-lib';
import * as pythonService from '@/lib/pythonService';
import { ConversionServiceError, InvalidFileError } from '@/lib/pythonService';

export class UnsupportedToolError extends Error {
  constructor(toolId: string) {
    super(`Conversion tool ${toolId} is not supported yet.`);
  }
}

export class ConversionFailedError extends Error {
  constructor(detail: string) {
    super(`Conversion failed: ${detail}`);
  }
}

export interface ProcessedFile {
  buffer: Buffer;
  cleanName: string;
  mimetype: string;
  ext: string;
  method?: string;
}

function targetFor(toolId: string): { mimetype: string; ext: string } | null {
  switch (toolId) {
    case 'jpg-to-png':
    case 'webp-to-png':
    case 'heic-to-png':
    case 'svg-to-png':
      return { mimetype: 'image/png', ext: '.png' };
    case 'png-to-jpg':
    case 'webp-to-jpg':
    case 'heic-to-jpg':
    case 'svg-to-jpg':
      return { mimetype: 'image/jpeg', ext: '.jpg' };
    case 'jpg-to-webp':
    case 'png-to-webp':
    case 'heic-to-webp':
    case 'svg-to-webp':
      return { mimetype: 'image/webp', ext: '.webp' };
    case 'pdf-to-word':
      return {
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: '.docx',
      };
    case 'pdf-to-excel':
      return {
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ext: '.xlsx',
      };
    case 'pdf-to-ppt':
      return {
        mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ext: '.pptx',
      };
    case 'txt-to-pdf':
    case 'images-to-pdf':
    case 'image-to-pdf':
    case 'word-to-pdf':
    case 'excel-to-pdf':
    case 'ppt-to-pdf':
      return { mimetype: 'application/pdf', ext: '.pdf' };
    default:
      return null;
  }
}

const UNICODE_FONT_PATH = path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf');

// pdfkit's line-wrapper falls back to fitting a "word" (a run of non-whitespace) character by
// character whenever it can't break on a normal boundary - that fallback is O(n^2) or worse in
// the run's length, so a single long unbroken run (a minified script, a base64 blob, a long
// hash/URL list) pasted into a .txt file can take minutes and pin a CPU core, well past any
// file-size check since the file itself can be tiny (verified: 32,000 unbroken chars alone took
// 102s; ~100,000 took 5+ minutes). Splicing a zero-width space (U+200B, no visible glyph) into
// any run longer than this gives pdfkit a wrap point without changing how the text looks, so it
// never sees a token long enough to trigger the quadratic case - bounded to milliseconds
// regardless of total document length. Tradeoff: copy-pasting a broken-up run back out of the
// PDF carries those invisible characters with it, which would corrupt a pasted URL/hash - an
// acceptable cost against a multi-minute hang.
const MAX_UNBROKEN_RUN = 120;
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

function breakLongRuns(text: string): string {
  return text.replace(/\S+/g, (token) => {
    if (token.length <= MAX_UNBROKEN_RUN) return token;
    const chunks: string[] = [];
    for (let i = 0; i < token.length; i += MAX_UNBROKEN_RUN) {
      chunks.push(token.slice(i, i + MAX_UNBROKEN_RUN));
    }
    return chunks.join(ZERO_WIDTH_SPACE);
  });
}

// Safety net on top of breakLongRuns above, in case some other input shape turns out to be
// pathologically slow for pdfkit that we haven't seen - fails cleanly with a user-safe message
// instead of hanging until the platform kills the whole request (maxDuration = 60 on the
// process route, with DB/upload work still to run afterwards - 30s leaves headroom for that).
const TXT_TO_PDF_TIMEOUT_MS = 30_000;

async function textToPdfBuffer(text: string): Promise<Buffer> {
  const safeText = breakLongRuns(text);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('This text file is too complex to convert in time. Try splitting it into smaller files.'));
    }, TXT_TO_PDF_TIMEOUT_MS);

    // Pass the font in as the constructor's `font` option rather than calling
    // .font() afterwards - pdfkit's default ctor path (`initFonts('Helvetica')`)
    // eagerly reads its bundled Helvetica.afm via `__dirname`, which Next's
    // bundler rewrites to a path that doesn't exist at runtime, crashing before
    // .font() would even run. Passing our own font here skips that entirely.
    // It also covers Latin (incl. diacritics), Cyrillic and Greek, unlike
    // pdfkit's built-in WinAnsi-only standard fonts.
    const doc = new PDFDocumentKit({ margin: 50, font: UNICODE_FONT_PATH });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    doc.fontSize(12).text(safeText, { align: 'left' });
    doc.end();
  });
}

export async function processFile(
  inputBuffer: Buffer,
  originalName: string,
  toolId: string
): Promise<ProcessedFile> {
  const target = targetFor(toolId);
  if (!target) {
    throw new UnsupportedToolError(toolId);
  }

  const { mimetype, ext } = target;
  const baseName = path.parse(originalName).name;
  const inputExt = path.extname(originalName).toLowerCase();
  let conversionMethod: string | undefined;

  try {
    let source: Buffer = inputBuffer;
    // undefined for every format except SVG, where we raise the rasterization
    // density below - otherwise icon-style SVGs (viewBox-only, no width/height,
    // e.g. viewBox="0 0 24 24") rasterize 1:1 into a useless 24x24 output.
    let sharpInputOptions: { density?: number } | undefined;

    if (inputExt === '.heic' || inputExt === '.heif') {
      const heicConvert = (await import('heic-convert')).default;
      source = Buffer.from(
        await heicConvert({
          buffer: inputBuffer,
          format: mimetype === 'image/jpeg' ? 'JPEG' : 'PNG',
          quality: 1,
        })
      );
    } else if (inputExt === '.svg') {
      const probe = await sharp(source).metadata();
      const naturalMax = Math.max(probe.width || 1, probe.height || 1);
      const MIN_RASTER_DIMENSION = 1024;
      const scale = naturalMax < MIN_RASTER_DIMENSION ? Math.min(MIN_RASTER_DIMENSION / naturalMax, 32) : 1;
      sharpInputOptions = { density: 72 * scale };
    }

    let outputBuffer: Buffer;

    if (toolId === 'pdf-to-word') {
      const result = await pythonService.pdfToWord(inputBuffer, originalName);
      outputBuffer = result.buffer;
      conversionMethod = result.method;
    } else if (toolId === 'pdf-to-excel') {
      outputBuffer = await pythonService.pdfToExcel(inputBuffer, originalName);
    } else if (toolId === 'pdf-to-ppt') {
      outputBuffer = await pythonService.pdfToPpt(inputBuffer, originalName);
    } else if (toolId === 'txt-to-pdf') {
      outputBuffer = await textToPdfBuffer(inputBuffer.toString('utf-8'));
    } else if (toolId === 'images-to-pdf' || toolId === 'image-to-pdf') {
      const jpgBuffer = await sharp(source, sharpInputOptions).rotate().flatten({ background: '#ffffff' }).jpeg().toBuffer();
      const pdfDoc = await PDFDocument.create();
      const image = await pdfDoc.embedJpg(jpgBuffer);
      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      outputBuffer = Buffer.from(await pdfDoc.save());
    } else if (toolId === 'word-to-pdf') {
      outputBuffer = await pythonService.wordToPdf(inputBuffer, originalName);
    } else if (toolId === 'excel-to-pdf') {
      outputBuffer = await pythonService.excelToPdf(inputBuffer, originalName);
    } else if (toolId === 'ppt-to-pdf') {
      outputBuffer = await pythonService.pptToPdf(inputBuffer, originalName);
    } else {
      // JPEG has no alpha channel; without an explicit flatten, sharp drops the
      // alpha channel and keeps whatever RGB was stored underneath it - which
      // many encoders zero out, turning transparent PNG/WEBP/SVG backgrounds
      // solid black instead of the white a user expects. flatten() is a no-op
      // on images that have no alpha channel, so this is safe for every source.
      // .rotate() bakes in EXIF orientation before it's stripped, so a phone
      // photo shot in portrait doesn't come out sideways - a no-op without an
      // orientation tag, so safe for every source too.
      let pipeline = sharp(source, sharpInputOptions).rotate();
      if (mimetype === 'image/jpeg') {
        pipeline = pipeline.flatten({ background: '#ffffff' });
      }
      outputBuffer = await pipeline
        .toFormat(mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpeg', {
          quality: 90,
        })
        .toBuffer();
    }

    return {
      buffer: outputBuffer,
      cleanName: `${baseName}${ext}`,
      mimetype,
      ext,
      method: conversionMethod,
    };
  } catch (error) {
    if (error instanceof UnsupportedToolError || error instanceof ConversionServiceError || error instanceof InvalidFileError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConversionFailedError(detail);
  }
}
