import { NextResponse } from 'next/server';
import { PDFDocument, rgb } from 'pdf-lib';
import { assertFileSizeAllowed, assertExtensionMatchesMimetype, FileTooLargeError, InvalidFileTypeError } from '@/lib/converter/validation';
import { enforceConversionLimit } from '@/lib/rateLimit';
import { autofitBlock, type EditedBlock, type FontFamilyGuess } from '@/lib/converter/pdfTextBlocks';
import { getAppropriateFont } from '@/lib/converter/pdfFonts';
import { imageCorrelationKey, type MovedImage } from '@/lib/converter/pdfImageObjects';
import { findImagePlacementsInContentStream, getJpegImageXObject, getPageContentBytes } from '@/lib/converter/pdfContentStream';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LINE_HEIGHT_RATIO = 1.2;
const FONT_FAMILIES: FontFamilyGuess[] = ['calibri', 'arial', 'times', 'sans', 'serif', 'mono'];

function hexToRgb(hex: string) {
  const clean = /^#?[0-9a-fA-F]{6}$/.test(hex) ? hex.replace('#', '') : 'FFFFFF';
  const value = parseInt(clean, 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

export async function POST(request: Request) {
  const limited = await enforceConversionLimit(request);
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.type !== 'application/pdf') {
    return NextResponse.json({ message: 'A PDF file is required.' }, { status: 400 });
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

  let edits: EditedBlock[];
  let movedImages: MovedImage[];
  try {
    edits = JSON.parse((formData.get('edits') as string) || '[]');
    movedImages = JSON.parse((formData.get('movedImages') as string) || '[]');
  } catch {
    return NextResponse.json({ message: 'Malformed edit data.' }, { status: 400 });
  }

  if (edits.length === 0 && movedImages.length === 0) {
    return NextResponse.json({ message: 'No edits to apply.' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfDoc = await PDFDocument.load(buffer);
    const pageCount = pdfDoc.getPageCount();
    const overflowIds: string[] = [];

    for (const block of edits) {
      if (block.pageIndex < 0 || block.pageIndex >= pageCount) continue;
      const page = pdfDoc.getPage(block.pageIndex);
      const familyGuess = FONT_FAMILIES.includes(block.fontFamilyGuess) ? block.fontFamilyGuess : 'sans';
      const font = await getAppropriateFont(pdfDoc, familyGuess, block.fontBold, block.fontItalic, block.newText);

      const { x, y, width, height } = block.bboxPdf;
      const bg = hexToRgb(block.bgColorHex);
      const textColor = hexToRgb(block.textColorHex || '#000000');

      // 1. Measure lines and calculate whiteout bounding box
      const lines = block.newText.split('\n');
      const maxLineWidth = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, block.fontSizePdf)), 0);
      const whiteoutWidth = Math.max(width, maxLineWidth + 4);
      const whiteoutHeight = Math.max(height, lines.length * block.fontSizePdf * 1.25);

      // 2. Whiteout / background erasure (skip for custom added text blocks)
      if (!block.isCustomAdded) {
        const origBox = block.originalBboxPdf || block.bboxPdf;
        const eraseX = origBox.x;
        const eraseY = origBox.y;
        const eraseW = origBox.width;
        const eraseH = origBox.height;

        // Erase original position if displaced or edited
        page.drawRectangle({
          x: eraseX - 1,
          y: eraseY - 1,
          width: eraseW + 4,
          height: eraseH + 2,
          color: bg,
        });

        // If newly expanded beyond original, also ensure target area is clean
        if (block.bboxPdf.x !== eraseX || block.bboxPdf.y !== eraseY || whiteoutHeight > eraseH) {
          page.drawRectangle({
            x: x - 1,
            y: y - 1,
            width: whiteoutWidth + 2,
            height: whiteoutHeight + 2,
            color: bg,
          });
        }
      }

      // 3. Render lines at target (shifted) coordinates with exact baseline grid
      const lineHeight =
        height > block.fontSizePdf * 1.5 && lines.length > 1
          ? (height - block.fontSizePdf) / (lines.length - 1)
          : block.fontSizePdf * 1.25;

      const firstBaselineY = y + height - 2 - block.fontSizePdf * 0.85;

      lines.forEach((lineText, index) => {
        if (!lineText) return;
        const lineY =
          lines.length === 1
            ? y + 2 + block.fontSizePdf * 0.25
            : firstBaselineY - index * lineHeight;

        page.drawText(lineText, {
          x: x + 2,
          y: lineY,
          size: block.fontSizePdf,
          font,
          color: textColor,
        });
      });
    }

    const contentBytesByPage = new Map<number, Uint8Array>();
    for (const moved of movedImages) {
      if (moved.pageIndex < 0 || moved.pageIndex >= pageCount) continue;
      const page = pdfDoc.getPage(moved.pageIndex);

      let contentBytes = contentBytesByPage.get(moved.pageIndex);
      if (!contentBytes) {
        contentBytes = getPageContentBytes(page);
        contentBytesByPage.set(moved.pageIndex, contentBytes);
      }

      const placements = findImagePlacementsInContentStream(contentBytes);
      const targetKey = imageCorrelationKey(moved.pageIndex, moved.bboxPdf);
      const match = placements.find((p) => imageCorrelationKey(moved.pageIndex, p.bboxPdf) === targetKey);
      if (!match) continue; // couldn't correlate - safe skip, image stays put rather than corrupting the page

      const xobj = getJpegImageXObject(page, match.resourceName);
      if (!xobj) continue; // non-JPEG raster: not supported for move in v1, safe skip

      // The Uint8Array constructor (unlike Buffer#slice, which shares the parent's
      // backing memory and byteOffset) always copies into a fresh zero-offset buffer.
      // pdf-lib's JpegEmbedder does `new DataView(bytes.buffer)` ignoring byteOffset,
      // so a non-zero-offset view (which PDFRawStream.contents often is, as a Buffer
      // sliced out of the whole parsed PDF) would make it read the wrong bytes.
      const embedded = await pdfDoc.embedJpg(new Uint8Array(xobj.getContents()));
      const bg = moved.bgColorHex ? hexToRgb(moved.bgColorHex) : rgb(1, 1, 1);
      page.drawRectangle({ x: moved.bboxPdf.x, y: moved.bboxPdf.y, width: moved.bboxPdf.width, height: moved.bboxPdf.height, color: bg });
      page.drawImage(embedded, { x: moved.newX, y: moved.newY, width: moved.bboxPdf.width, height: moved.bboxPdf.height });
    }

    const pdfBytes = await pdfDoc.save();

    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Edited_Document_${Date.now()}.pdf"`,
        'Access-Control-Expose-Headers': 'Content-Disposition, X-Overflow-Blocks',
        'X-Overflow-Blocks': JSON.stringify(overflowIds),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message: `Failed to save edited PDF: ${message}` }, { status: 400 });
  }
}
