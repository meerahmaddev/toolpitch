import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { assertFileSizeAllowed, assertExtensionMatchesMimetype, FileTooLargeError, InvalidFileTypeError } from '@/lib/converter/validation';
import { enforceConversionLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

type OutputFormat = 'original' | 'jpeg' | 'png' | 'webp';

interface EditConfig {
  quality?: string | number;
  format?: OutputFormat;
}

async function decodeToBuffer(inputBuffer: Buffer, originalName: string): Promise<Buffer> {
  const ext = (originalName.split('.').pop() || '').toLowerCase();
  if (ext === 'heic' || ext === 'heif') {
    const heicConvert = (await import('heic-convert')).default;
    return Buffer.from(await heicConvert({ buffer: inputBuffer, format: 'PNG', quality: 1 }));
  }
  return inputBuffer;
}

export async function POST(request: Request) {
  const limited = await enforceConversionLimit(request);
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get('file');
  const configStr = formData.get('config');

  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'No image file uploaded' }, { status: 400 });
  }
  // Sharp only reads a GIF's first frame by default and this build can't
  // re-encode a multi-frame GIF back out, so compressing an animated GIF
  // would silently flatten it to a single static frame. Reject it outright
  // instead of quietly losing the animation.
  if (/\.gif$/i.test(file.name) || file.type === 'image/gif') {
    return NextResponse.json({ message: "GIF images aren't supported for compression yet - animation would be lost." }, { status: 400 });
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

  try {
    const config: EditConfig = typeof configStr === 'string' && configStr ? JSON.parse(configStr) : {};
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const decodedBuffer = await decodeToBuffer(inputBuffer, file.name);
    // Bake in the EXIF Orientation (e.g. a phone photo shot in portrait but
    // stored as landscape pixels + a rotation tag) before anything else, since
    // the output strips metadata - without this the rotation hint is lost and
    // the compressed image comes out sideways. No-op if there's no EXIF tag.
    let image = sharp(decodedBuffer).rotate();

    const quality = config.quality ? parseInt(String(config.quality), 10) : 80;
    const originalExt = (file.name.split('.').pop() || '').toLowerCase();
    const requestedFormat: OutputFormat = config.format || 'original';

    let outputMime: string;
    let outputExt: string;

    const resolvedFormat: Exclude<OutputFormat, 'original'> =
      requestedFormat !== 'original'
        ? requestedFormat
        : originalExt === 'png' || file.type === 'image/png'
          ? 'png'
          : originalExt === 'webp' || file.type === 'image/webp'
            ? 'webp'
            : 'jpeg';

    if (resolvedFormat === 'png') {
      // PNG is lossless, so sharp's `quality` option alone barely moves file
      // size - it only nudges libimagequant's target, which saturates near
      // the 256-colour cap for most real images regardless of the value.
      // Map the same 1-100 slider onto an explicit palette size instead, so
      // it behaves like a real, gradual size/quality control the way it
      // already does for JPEG/WEBP.
      const clampedQuality = Math.min(100, Math.max(1, quality));
      const pngColors = Math.max(2, Math.round(2 + ((clampedQuality - 1) / 99) * 254));
      image = image.png({ palette: true, colors: pngColors, compressionLevel: 9 });
      outputMime = 'image/png';
      outputExt = 'png';
    } else if (resolvedFormat === 'webp') {
      image = image.webp({ quality });
      outputMime = 'image/webp';
      outputExt = 'webp';
    } else {
      image = image.flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg({ quality, mozjpeg: true });
      outputMime = 'image/jpeg';
      outputExt = 'jpg';
    }

    const outputBuffer = await image.toBuffer();
    const newFilename = `compressed_${Date.now()}.${outputExt}`;

    return new Response(new Uint8Array(outputBuffer), {
      headers: {
        'Content-Type': outputMime,
        'Content-Disposition': `attachment; filename="${newFilename}"`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message: `Failed to compress image: ${message}` }, { status: 400 });
  }
}
