// Pure TS - image counterpart to pdfTextBlocks.ts. extractImageObjects() takes pdf.js's
// OPS codes and Util.transform as parameters instead of importing 'pdfjs-dist' directly,
// so this file stays importable from both client and server code even though, in practice,
// extraction only ever runs client-side (pdf.js is browser-only in this app).
// See C:\Users\user\.claude\plans\luminous-soaring-crab.md ("Image detection & move").

import type { Bbox } from './pdfTextBlocks';

export interface ImageObject {
  id: string;
  pageIndex: number;
  bboxPdf: Bbox;
}

export interface MovedImage {
  id: string;
  pageIndex: number;
  bboxPdf: Bbox; // ORIGINAL position - used server-side to locate the matching XObject
  newX: number;
  newY: number;
  bgColorHex: string; // sampled background, used to erase the original position
}

const CORRELATION_ROUNDING_PT = 1;

/** Same page + same rounded original bbox = same image, whether reasoned about client or server side. */
export function imageCorrelationKey(pageIndex: number, bboxPdf: Bbox): string {
  const r = (n: number) => Math.round(n / CORRELATION_ROUNDING_PT) * CORRELATION_ROUNDING_PT;
  return `p${pageIndex}:${r(bboxPdf.x)},${r(bboxPdf.y)},${r(bboxPdf.width)},${r(bboxPdf.height)}`;
}

export type Matrix = [number, number, number, number, number, number];
export type ComposeMatrix = (m1: Matrix, m2: Matrix) => Matrix;

export const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

/** Matches pdf.js's Util.transform(m1, m2) convention: m2 applied first, then m1. */
export function composeMatrix(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Bbox of the unit square [0,1]x[0,1] mapped through ctm - how PDF's `Do` places an image. */
export function bboxFromUnitSquareCtm(ctm: Matrix): Bbox | null {
  const [a, b, c, d, e, f] = ctm;
  if (Math.abs(b) > 1e-3 || Math.abs(c) > 1e-3) return null; // rotated/skewed placement - excluded in v1
  return {
    x: a >= 0 ? e : e + a,
    y: d >= 0 ? f : f + d,
    width: Math.abs(a),
    height: Math.abs(d),
  };
}

export interface OperatorListLike {
  fnArray: number[];
  argsArray: unknown[][];
}

export interface PdfOpsCodes {
  save: number;
  restore: number;
  transform: number;
  paintImageXObject: number;
  paintImageMaskXObject: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
}

/**
 * Walks a pdf.js operator list tracking the graphics-state matrix stack (save/
 * restore/transform, and form XObject begin/end which behave like save+cm/restore)
 * to find every image paint op's page-space bounding box. Client-side only in
 * practice - pdf.js is a browser dependency - but written dependency-free so it's
 * testable without a DOM.
 */
export function extractImageObjects(opList: OperatorListLike, pageIndex: number, ops: PdfOpsCodes): ImageObject[] {
  const images: ImageObject[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY_MATRIX;
  let imageIndex = 0;

  const imagePaintOps = new Set([ops.paintImageXObject, ops.paintImageMaskXObject]);

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === ops.save) {
      stack.push(ctm);
      continue;
    }
    if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      // matrix may be a Float32Array (pdf.js transfers it as a typed array across the
      // worker boundary) rather than a plain Array, so check .length, not Array.isArray.
      const matrix = Array.isArray(args) ? args[0] : undefined;
      if (matrix && typeof matrix === 'object' && 'length' in matrix && (matrix as ArrayLike<number>).length === 6) {
        ctm = composeMatrix(ctm, Array.from(matrix as ArrayLike<number>) as Matrix);
      }
      continue;
    }
    if (fn === ops.restore || fn === ops.paintFormXObjectEnd) {
      ctm = stack.pop() ?? IDENTITY_MATRIX;
      continue;
    }
    if (fn === ops.transform && Array.isArray(args) && args.length === 6) {
      ctm = composeMatrix(ctm, args as Matrix);
      continue;
    }
    if (imagePaintOps.has(fn)) {
      const bboxPdf = bboxFromUnitSquareCtm(ctm);
      imageIndex++;
      if (bboxPdf && bboxPdf.width > 1 && bboxPdf.height > 1) {
        images.push({ id: `p${pageIndex}-img${imageIndex}`, pageIndex, bboxPdf });
      }
    }
  }

  return images;
}
