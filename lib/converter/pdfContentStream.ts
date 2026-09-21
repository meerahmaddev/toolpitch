// Server-only: locates image XObject placements in a page's content stream so
// edit-pdf/route.ts can move them. pdf-lib doesn't parse content-stream operators
// itself (it's a document-structure library, not a renderer), so this is a small,
// focused tokenizer - not a general PDF interpreter. It only tracks q/Q/cm/Do,
// which is all that's needed to find where images are painted.
//
// Known limitations (safe degradation, not crashes - see plan §"Image detection & move"):
// - Does not recurse into Form XObjects, so an image nested inside one won't be found
//   (it simply won't appear as movable - matches the client-side pdf.js walk closely
//   enough for correlation, since both skip the same nested case).
// - Inline images (BI...ID...EI) are skipped by scanning for "EI" bytes, which is a
//   best-effort heuristic - could rarely mis-skip if "EI" appears inside binary data.
import { PDFArray, PDFDict, PDFName, PDFPage, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib';
import type { Bbox } from './pdfTextBlocks';
import { bboxFromUnitSquareCtm, composeMatrix, IDENTITY_MATRIX, type Matrix } from './pdfImageObjects';

export interface ImagePlacement {
  resourceName: string;
  bboxPdf: Bbox;
}

export function getPageContentBytes(page: PDFPage): Uint8Array {
  const contents = page.node.Contents();
  const streams: PDFRawStream[] = [];

  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const stream = contents.lookupMaybe(i, PDFStream);
      if (stream instanceof PDFRawStream) streams.push(stream);
    }
  } else if (contents instanceof PDFRawStream) {
    streams.push(contents);
  }

  const decoded = streams.map((s) => decodePDFRawStream(s).decode());
  const totalLen = decoded.reduce((sum, b) => sum + b.length + 1, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const bytes of decoded) {
    combined.set(bytes, offset);
    offset += bytes.length;
    combined[offset] = 0x20; // PDF spec: content streams from an array must be joined with whitespace
    offset += 1;
  }
  return combined;
}

/** Minimal content-stream tokenizer tracking q/Q/cm graphics state and recording every `Do` call's bbox. */
export function findImagePlacementsInContentStream(bytes: Uint8Array): ImagePlacement[] {
  const placements: ImagePlacement[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY_MATRIX;
  const operands: (number | string)[] = [];

  const len = bytes.length;
  let i = 0;

  const isWhitespace = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0;
  const isDelimiter = (c: number) =>
    c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;

  while (i < len) {
    const c = bytes[i];

    if (isWhitespace(c)) {
      i++;
      continue;
    }

    if (c === 0x25) {
      while (i < len && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }

    if (c === 0x2f) {
      let j = i + 1;
      while (j < len && !isWhitespace(bytes[j]) && !isDelimiter(bytes[j])) j++;
      operands.push(decodeName(bytes.subarray(i + 1, j)));
      i = j;
      continue;
    }

    if (c === 0x28) {
      let depth = 1;
      let j = i + 1;
      while (j < len && depth > 0) {
        if (bytes[j] === 0x5c) j += 2;
        else {
          if (bytes[j] === 0x28) depth++;
          else if (bytes[j] === 0x29) depth--;
          j++;
        }
      }
      operands.push('');
      i = j;
      continue;
    }

    if (c === 0x3c) {
      if (bytes[i + 1] === 0x3c) {
        let depth = 1;
        let j = i + 2;
        while (j < len && depth > 0) {
          if (bytes[j] === 0x3c && bytes[j + 1] === 0x3c) {
            depth++;
            j += 2;
          } else if (bytes[j] === 0x3e && bytes[j + 1] === 0x3e) {
            depth--;
            j += 2;
          } else j++;
        }
        operands.push('');
        i = j;
        continue;
      }
      let j = i + 1;
      while (j < len && bytes[j] !== 0x3e) j++;
      operands.push('');
      i = j + 1;
      continue;
    }

    if (c === 0x5b) {
      let depth = 1;
      let j = i + 1;
      while (j < len && depth > 0) {
        if (bytes[j] === 0x5b) depth++;
        else if (bytes[j] === 0x5d) depth--;
        j++;
      }
      operands.push('');
      i = j;
      continue;
    }

    if ((c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === 0x2e) {
      let j = i + 1;
      while (j < len && !isWhitespace(bytes[j]) && !isDelimiter(bytes[j])) j++;
      const num = parseFloat(asciiSlice(bytes, i, j));
      operands.push(Number.isFinite(num) ? num : 0);
      i = j;
      continue;
    }

    let j = i;
    while (j < len && !isWhitespace(bytes[j]) && !isDelimiter(bytes[j])) j++;
    const op = asciiSlice(bytes, i, j);
    i = j;

    if (op === 'BI') {
      const eiIndex = findSubsequence(bytes, i, [0x45, 0x49]);
      i = eiIndex === -1 ? len : eiIndex + 2;
      operands.length = 0;
      continue;
    }

    if (op === 'q') {
      stack.push(ctm);
    } else if (op === 'Q') {
      ctm = stack.pop() ?? IDENTITY_MATRIX;
    } else if (op === 'cm') {
      const nums = operands.filter((v): v is number => typeof v === 'number').slice(-6);
      if (nums.length === 6) ctm = composeMatrix(ctm, nums as Matrix);
    } else if (op === 'Do') {
      const name = operands[operands.length - 1];
      if (typeof name === 'string' && name) {
        const bboxPdf = bboxFromUnitSquareCtm(ctm);
        if (bboxPdf && bboxPdf.width > 1 && bboxPdf.height > 1) {
          placements.push({ resourceName: name, bboxPdf });
        }
      }
    }

    operands.length = 0;
  }

  return placements;
}

/** Looks up an XObject by resource name and returns it only if it's a JPEG-encoded Image (v1 re-embed support). */
export function getJpegImageXObject(page: PDFPage, resourceName: string): PDFRawStream | null {
  const resources = page.node.Resources();
  const xObjectDict = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  const entry = xObjectDict?.lookupMaybe(PDFName.of(resourceName), PDFStream);
  if (!(entry instanceof PDFRawStream)) return null;

  const subtype = entry.dict.lookupMaybe(PDFName.of('Subtype'), PDFName);
  if (subtype?.asString() !== '/Image') return null;

  const filter = entry.dict.lookupMaybe(PDFName.of('Filter'), PDFName);
  if (filter?.asString() !== '/DCTDecode') return null; // non-JPEG raster: safe degradation, not moved in v1

  return entry;
}

function asciiSlice(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let k = start; k < end; k++) s += String.fromCharCode(bytes[k]);
  return s;
}

function decodeName(bytes: Uint8Array): string {
  let s = '';
  for (let k = 0; k < bytes.length; k++) {
    if (bytes[k] === 0x23 && k + 2 < bytes.length) {
      const code = parseInt(String.fromCharCode(bytes[k + 1], bytes[k + 2]), 16);
      if (!Number.isNaN(code)) {
        s += String.fromCharCode(code);
        k += 2;
        continue;
      }
    }
    s += String.fromCharCode(bytes[k]);
  }
  return s;
}

function findSubsequence(bytes: Uint8Array, from: number, needle: number[]): number {
  outer: for (let k = from; k <= bytes.length - needle.length; k++) {
    for (let n = 0; n < needle.length; n++) {
      if (bytes[k + n] !== needle[n]) continue outer;
    }
    return k;
  }
  return -1;
}
