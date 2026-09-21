// Pure TS, no DOM/Node APIs - importable from both the client (pdfjs-dist text
// extraction + live preview wrap) and the edit-pdf API route (pdf-lib redraw).
// See C:\Users\user\.claude\plans\luminous-soaring-crab.md for the full design.

export interface Bbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FontFamilyGuess = 'calibri' | 'arial' | 'times' | 'sans' | 'serif' | 'mono';

export interface TextBlock {
  id: string;
  pageIndex: number;
  bboxPdf: Bbox;
  originalText: string;
  fontSizePdf: number;
  lineHeightPdf: number;
  fontFamilyGuess: FontFamilyGuess;
  /** Detected from the source PDF font's name - see guessFontStyle(). */
  fontBold: boolean;
  fontItalic: boolean;
  bgColorHex: string;
  textColorHex: string;
  rotated: boolean;
  lowConfidence: boolean;
  nonEditable: boolean;
  isCustomAdded?: boolean;
}

export interface EditedBlock {
  id: string;
  pageIndex: number;
  bboxPdf: Bbox;
  originalBboxPdf?: Bbox;
  newText: string;
  fontSizePdf: number;
  fontFamilyGuess: FontFamilyGuess;
  fontBold: boolean;
  fontItalic: boolean;
  bgColorHex: string;
  textColorHex?: string;
  isCustomAdded?: boolean;
  isDisplaced?: boolean;
}

/** Metric source is swappable: canvas measureText client-side, pdf-lib font.widthOfTextAtSize server-side. */
export type WidthMeasurer = (text: string, fontSizePt: number) => number;

export interface RawTextItem {
  str: string;
  transform: number[]; // [a, b, c, d, e, f], PDF user space (y-up)
  width: number;
  height: number;
  fontName: string;
}

const ROTATION_EPSILON = 1e-3;

interface LineItem extends RawTextItem {
  fontSizePdf: number;
  xPdf: number;
  baselineY: number;
}

export interface TextLine {
  items: LineItem[];
  text: string;
  xPdf: number;
  rightXPdf: number;
  widthPdf: number;
  yPdfBaseline: number;
  fontSizePdf: number;
  fontName: string;
  lowConfidence: boolean;
}

/**
 * Groups raw pdf.js text items into visual lines by baseline-Y proximity.
 * If wide gaps exist (e.g. table columns), splits them into separate cell lines
 * so each table cell or column is individually editable without breaking layout.
 */
export function extractLines(items: RawTextItem[]): TextLine[] {
  const horizontal: LineItem[] = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const [a, b, c, , , f] = item.transform;
    if (Math.abs(b) > ROTATION_EPSILON || Math.abs(c) > ROTATION_EPSILON) continue; // rotated/skewed text
    const fontSizePdf = Math.hypot(a, b);
    if (fontSizePdf <= 0) continue;
    horizontal.push({ ...item, fontSizePdf, xPdf: item.transform[4], baselineY: f });
  }

  horizontal.sort((p, q) => {
    if (Math.abs(p.baselineY - q.baselineY) > 1e-6) return q.baselineY - p.baselineY; // top of page first
    return p.xPdf - q.xPdf;
  });

  const lines: TextLine[] = [];
  let current: LineItem[] = [];
  let avgBaselineY = 0;
  let avgFontSize = 0;

  const flush = () => {
    if (current.length === 0) return;
    const cellLines = splitLineIntoCells(current);
    lines.push(...cellLines);
    current = [];
  };

  for (const item of horizontal) {
    if (current.length === 0) {
      current = [item];
      avgBaselineY = item.baselineY;
      avgFontSize = item.fontSizePdf;
      continue;
    }
    const tolerance = Math.max(2, 0.35 * avgFontSize);
    if (Math.abs(item.baselineY - avgBaselineY) <= tolerance) {
      current.push(item);
      avgBaselineY = current.reduce((s, i) => s + i.baselineY, 0) / current.length;
      avgFontSize = current.reduce((s, i) => s + i.fontSizePdf, 0) / current.length;
    } else {
      flush();
      current = [item];
      avgBaselineY = item.baselineY;
      avgFontSize = item.fontSizePdf;
    }
  }
  flush();

  return lines;
}

function splitLineIntoCells(items: LineItem[]): TextLine[] {
  const sorted = [...items].sort((p, q) => p.xPdf - q.xPdf);
  const segments: LineItem[][] = [];
  let currentSegment: LineItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (currentSegment.length === 0) {
      currentSegment.push(item);
      continue;
    }

    const prev = currentSegment[currentSegment.length - 1];
    const gap = item.xPdf - (prev.xPdf + prev.width);
    const wideColumnGapThreshold = Math.max(14, 2.2 * item.fontSizePdf);

    const prevStyle = guessFontStyle(prev.fontName);
    const itemStyle = guessFontStyle(item.fontName);
    const styleChanged = prevStyle.bold !== itemStyle.bold || prevStyle.italic !== itemStyle.italic;
    const fontChanged = prev.fontName !== item.fontName && Math.abs(prev.fontSizePdf - item.fontSizePdf) > 1.2;

    if (gap > wideColumnGapThreshold || (styleChanged && gap >= 0) || fontChanged) {
      // Split into separate style span / column block
      segments.push(currentSegment);
      currentSegment = [item];
    } else {
      currentSegment.push(item);
    }
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments.map((seg) => buildSingleLine(seg));
}

function buildSingleLine(sorted: LineItem[]): TextLine {
  let text = '';
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (i > 0) {
      const prev = sorted[i - 1];
      const gap = item.xPdf - (prev.xPdf + prev.width);
      const wordGapThreshold = 0.25 * item.fontSizePdf;
      if (gap > wordGapThreshold && !/\s$/.test(text)) text += ' ';
    }
    text += item.str;
  }

  const fontSizePdf = sorted.reduce((s, i) => s + i.fontSizePdf, 0) / sorted.length;
  const xPdf = sorted[0].xPdf;
  const last = sorted[sorted.length - 1];
  const rightXPdf = last.xPdf + last.width;
  const yPdfBaseline = sorted.reduce((s, i) => s + i.baselineY, 0) / sorted.length;

  return {
    items: sorted,
    text,
    xPdf,
    rightXPdf,
    widthPdf: rightXPdf - xPdf,
    yPdfBaseline,
    fontSizePdf,
    fontName: mostCommon(sorted.map((i) => i.fontName)),
    lowConfidence: false,
  };
}

export function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export function guessFontFamily(fontName: string): FontFamilyGuess {
  const cleaned = fontName.replace(/^[A-Z]{6}\+/, '').toLowerCase();
  // 1. Check Monospace first
  if (/courier|mono|consolas|menlo|code/.test(cleaned)) return 'mono';
  // 2. Check Sans-serif first so "sans-serif" never matches "serif"
  if (/sans|arial|helvetica|inter|roboto|segoe|open.?sans|lato|poppins|system/.test(cleaned)) return 'arial';
  // 3. Check Calibri / Office fonts
  if (/calibri|carlito|aptos/.test(cleaned)) return 'calibri';
  // 4. Check Serif / Times
  if (/times|georgia|garamond|cambria|serif|palatino|minion|book/.test(cleaned)) return 'times';
  // Default to clean universal Arial/Sans
  return 'arial';
}

export function guessFontStyle(fontName: string): { bold: boolean; italic: boolean } {
  const cleaned = fontName.replace(/^[A-Z]{6}\+/, '').toLowerCase();
  const isBold = /bold|black|heavy|semibold|demibold|medium|b\b|bd\b|w[6-9]|700|800|900|-b|-sb/i.test(cleaned);
  const isItalic = /italic|oblique|slanted|ita\b|i\b|-i/i.test(cleaned);
  return {
    bold: isBold,
    italic: isItalic,
  };
}

const BLOCK_PADDING_PT = 2;

/**
 * iLovePDF-Style Paragraph & Heading Grouping:
 * Consecutive lines belonging to the same paragraph (same font size, same weight,
 * left-aligned, natural line gap) are grouped into a cohesive paragraph block.
 * Headings, subtitles, and lists remain distinct blocks.
 */
export function clusterLinesIntoBlocks(lines: TextLine[], pageIndex: number): TextBlock[] {
  const blocks: TextBlock[] = [];
  let currentGroup: TextLine[] = [];
  let blockIndex = 0;

  const flush = () => {
    if (currentGroup.length === 0) return;
    blocks.push(buildParagraphBlock(currentGroup, pageIndex, blockIndex));
    blockIndex++;
    currentGroup = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (currentGroup.length === 0) {
      currentGroup = [line];
      continue;
    }

    const prev = currentGroup[currentGroup.length - 1];
    const gap = prev.yPdfBaseline - line.yPdfBaseline; // positive = downwards

    const sameSize = Math.abs(prev.fontSizePdf - line.fontSizePdf) / prev.fontSizePdf <= 0.12;
    const prevStyle = guessFontStyle(prev.fontName);
    const lineStyle = guessFontStyle(line.fontName);
    const sameWeight = prevStyle.bold === lineStyle.bold;
    const leftAligned = Math.abs(prev.xPdf - line.xPdf) <= 8;
    const naturalGap = gap > prev.fontSizePdf * 0.6 && gap <= prev.fontSizePdf * 1.6;
    const isList = /^[•\-\*\d+\.]\s/.test(line.text);

    if (sameSize && sameWeight && leftAligned && naturalGap && !isList) {
      currentGroup.push(line);
    } else {
      flush();
      currentGroup = [line];
    }
  }
  flush();

  return blocks;
}

function buildParagraphBlock(lines: TextLine[], pageIndex: number, blockIndex: number): TextBlock {
  const first = lines[0];
  const last = lines[lines.length - 1];
  const avgFontSize = lines.reduce((s, l) => s + l.fontSizePdf, 0) / lines.length;

  const yTop = first.yPdfBaseline + avgFontSize * 0.85;
  const yBottom = last.yPdfBaseline - avgFontSize * 0.25;
  const x0 = Math.min(...lines.map((l) => l.xPdf)) - BLOCK_PADDING_PT;
  const x1 = Math.max(...lines.map((l) => l.rightXPdf)) + BLOCK_PADDING_PT;

  const lineGaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    lineGaps.push(lines[i - 1].yPdfBaseline - lines[i].yPdfBaseline);
  }
  const lineHeightPdf =
    lineGaps.length > 0 ? lineGaps.reduce((s, g) => s + g, 0) / lineGaps.length : avgFontSize * 1.25;

  const style = guessFontStyle(first.fontName);

  return {
    id: `p${pageIndex}-b${blockIndex}`,
    pageIndex,
    bboxPdf: {
      x: x0,
      y: yBottom - BLOCK_PADDING_PT,
      width: Math.max(12, x1 - x0),
      height: Math.max(avgFontSize * 1.2, yTop - yBottom + 2 * BLOCK_PADDING_PT),
    },
    originalText: lines.map((l) => l.text).join('\n'),
    fontSizePdf: avgFontSize,
    lineHeightPdf,
    fontFamilyGuess: guessFontFamily(first.fontName),
    fontBold: style.bold,
    fontItalic: style.italic,
    bgColorHex: '#FFFFFF',
    textColorHex: '#000000',
    rotated: false,
    lowConfidence: lines.some((l) => l.lowConfidence),
    nonEditable: false,
  };
}

/**
 * Greedy word-wrap against a pluggable width measurer. Splits on explicit '\n'
 * first (user-forced hard breaks); each paragraph wraps independently. A single
 * token wider than the box is hard-split by character so it can never loop forever.
 */
export function wrapTextToWidth(text: string, fontSizePt: number, maxWidthPt: number, measure: WidthMeasurer): string[] {
  const paragraphs = text.split('\n');
  const allLines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      allLines.push('');
      continue;
    }

    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (measure(candidate, fontSizePt) <= maxWidthPt) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        allLines.push(currentLine);
        currentLine = '';
      }

      if (measure(word, fontSizePt) > maxWidthPt) {
        const pieces = hardSplitWord(word, fontSizePt, maxWidthPt, measure);
        allLines.push(...pieces.slice(0, -1));
        currentLine = pieces[pieces.length - 1] ?? '';
      } else {
        currentLine = word;
      }
    }
    allLines.push(currentLine);
  }

  return allLines;
}

function hardSplitWord(word: string, fontSizePt: number, maxWidthPt: number, measure: WidthMeasurer): string[] {
  const parts: string[] = [];
  let current = '';
  for (const ch of word) {
    const candidate = current + ch;
    if (measure(candidate, fontSizePt) <= maxWidthPt || !current) {
      current = candidate;
    } else {
      parts.push(current);
      current = ch;
    }
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : [''];
}

export interface AutofitOptions {
  shrinkStepPt: number;
  minFontSizePt: number;
  lineHeightRatio: number;
}

export interface AutofitResult {
  lines: string[];
  fontSizePt: number;
  overflowed: boolean;
}

const DEFAULT_AUTOFIT_OPTIONS: AutofitOptions = { shrinkStepPt: 0.5, minFontSizePt: 6, lineHeightRatio: 1.2 };

/**
 * Re-wraps newText at originalFontSizePt, shrinking (never growing) in small
 * steps until it fits the block's original height or the minimum size is hit.
 */
export function autofitBlock(
  newText: string,
  originalFontSizePt: number,
  boxWidthPt: number,
  boxHeightPt: number,
  measure: WidthMeasurer,
  opts: Partial<AutofitOptions> = {}
): AutofitResult {
  const options = { ...DEFAULT_AUTOFIT_OPTIONS, ...opts };
  let fontSizePt = originalFontSizePt;
  let lines: string[] = [];
  let height = 0;

  while (true) {
    lines = wrapTextToWidth(newText, fontSizePt, boxWidthPt, measure);
    height = lines.length * fontSizePt * options.lineHeightRatio;
    if (height <= boxHeightPt || fontSizePt <= options.minFontSizePt) break;
    fontSizePt = Math.max(options.minFontSizePt, fontSizePt - options.shrinkStepPt);
  }

  return { lines, fontSizePt, overflowed: height > boxHeightPt };
}

export interface BlockDisplacement {
  blockId: string;
  deltaHeightPt: number;
  shiftYPt: number; // Positive = downwards in PDF coordinates
  newBboxPdf: Bbox;
  isDisplaced: boolean;
}

/**
 * Calculates dynamic downward reflow shift for all text blocks on a page.
 * When an upper block grows in height (lines added), all blocks below it
 * shift downwards by the cumulative delta height.
 */
export function calculateReflowDisplacements(
  blocks: TextBlock[],
  editedText: Record<string, string>,
  heightDeltas?: Record<string, number>
): Record<string, BlockDisplacement> {
  // Sort blocks from top of page downwards (PDF Y decreases downwards)
  const sorted = [...blocks].sort((a, b) => b.bboxPdf.y - a.bboxPdf.y);
  const result: Record<string, BlockDisplacement> = {};

  let cumulativeExpansion = 0;

  for (const block of sorted) {
    const currentText = editedText[block.id] ?? block.originalText;
    const origLines = block.originalText.split('\n').length;
    const currLines = currentText.split('\n').length;

    const lh = block.lineHeightPdf || block.fontSizePdf * 1.25;

    let deltaH = 0;
    if (heightDeltas && heightDeltas[block.id] !== undefined) {
      deltaH = heightDeltas[block.id];
    } else if (currLines !== origLines) {
      deltaH = (currLines - origLines) * lh;
    }

    const shiftY = cumulativeExpansion;
    const isDisplaced = Math.abs(shiftY) > 0.5;

    const newBboxPdf: Bbox = {
      x: block.bboxPdf.x,
      y: block.bboxPdf.y - shiftY - Math.max(0, deltaH),
      width: block.bboxPdf.width,
      height: block.bboxPdf.height + Math.max(0, deltaH),
    };

    result[block.id] = {
      blockId: block.id,
      deltaHeightPt: deltaH,
      shiftYPt: shiftY,
      newBboxPdf,
      isDisplaced,
    };

    if (deltaH > 0) {
      cumulativeExpansion += deltaH;
    }
  }

  return result;
}
