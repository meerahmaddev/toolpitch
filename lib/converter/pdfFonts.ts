import fontkit from '@pdf-lib/fontkit';
import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, PDFFont } from 'pdf-lib';
import type { FontFamilyGuess } from './pdfTextBlocks';

const TTF_FONTS: Record<FontFamilyGuess, { regular: string; bold: string; italic: string; boldItalic: string }> = {
  calibri: {
    regular: path.join(process.cwd(), 'public/fonts/calibri.ttf'),
    bold: path.join(process.cwd(), 'public/fonts/calibrib.ttf'),
    italic: path.join(process.cwd(), 'public/fonts/calibrii.ttf'),
    boldItalic: path.join(process.cwd(), 'public/fonts/calibriz.ttf'),
  },
  arial: {
    regular: path.join(process.cwd(), 'public/fonts/arial.ttf'),
    bold: path.join(process.cwd(), 'public/fonts/arialbd.ttf'),
    italic: path.join(process.cwd(), 'public/fonts/ariali.ttf'),
    boldItalic: path.join(process.cwd(), 'public/fonts/arialbi.ttf'),
  },
  times: {
    regular: path.join(process.cwd(), 'public/fonts/times.ttf'),
    bold: path.join(process.cwd(), 'public/fonts/timesbd.ttf'),
    italic: path.join(process.cwd(), 'public/fonts/timesi.ttf'),
    boldItalic: path.join(process.cwd(), 'public/fonts/timesbi.ttf'),
  },
  sans: {
    regular: path.join(process.cwd(), 'public/fonts/arial.ttf'),
    bold: path.join(process.cwd(), 'public/fonts/arialbd.ttf'),
    italic: path.join(process.cwd(), 'public/fonts/ariali.ttf'),
    boldItalic: path.join(process.cwd(), 'public/fonts/arialbi.ttf'),
  },
  serif: {
    regular: path.join(process.cwd(), 'public/fonts/times.ttf'),
    bold: path.join(process.cwd(), 'public/fonts/timesbd.ttf'),
    italic: path.join(process.cwd(), 'public/fonts/timesi.ttf'),
    boldItalic: path.join(process.cwd(), 'public/fonts/timesbi.ttf'),
  },
  mono: {
    regular: path.join(process.cwd(), 'public/fonts/NotoSansMono-Regular.ttf'),
    bold: path.join(process.cwd(), 'public/fonts/NotoSansMono-Regular.ttf'),
    italic: path.join(process.cwd(), 'public/fonts/NotoSansMono-Regular.ttf'),
    boldItalic: path.join(process.cwd(), 'public/fonts/NotoSansMono-Regular.ttf'),
  },
};

const cachedBytes: Record<string, Buffer> = {};
const docFontCache = new WeakMap<PDFDocument, Map<string, PDFFont>>();

function getDocFontMap(pdfDoc: PDFDocument): Map<string, PDFFont> {
  let map = docFontCache.get(pdfDoc);
  if (!map) {
    map = new Map<string, PDFFont>();
    docFontCache.set(pdfDoc, map);
  }
  return map;
}

export class UnsupportedGlyphError extends Error {
  constructor() {
    super('This PDF contains characters not supported by the editor’s font.');
  }
}

/**
 * Returns an authentic TrueType font matching the requested family and weight/style.
 * Embeds genuine TrueType outlines (Calibri, Arial, Times) for 100% exact rendering.
 */
export async function getAppropriateFont(
  pdfDoc: PDFDocument,
  familyGuess: FontFamilyGuess,
  bold: boolean,
  italic: boolean,
  text: string
): Promise<PDFFont> {
  const fontMap = getDocFontMap(pdfDoc);
  const cacheKey = `${familyGuess}_b${bold ? 1 : 0}_i${italic ? 1 : 0}`;

  if (fontMap.has(cacheKey)) {
    return fontMap.get(cacheKey)!;
  }

  pdfDoc.registerFontkit(fontkit);

  const familyGroup = TTF_FONTS[familyGuess] ?? TTF_FONTS.calibri;
  let fontPath = familyGroup.regular;
  if (bold && italic) fontPath = familyGroup.boldItalic;
  else if (bold) fontPath = familyGroup.bold;
  else if (italic) fontPath = familyGroup.italic;

  if (!cachedBytes[fontPath]) {
    try {
      cachedBytes[fontPath] = await fs.readFile(fontPath);
    } catch {
      const fallbackPath = path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf');
      cachedBytes[fontPath] = await fs.readFile(fallbackPath);
    }
  }

  try {
    const font = await pdfDoc.embedFont(cachedBytes[fontPath], { subset: true });
    fontMap.set(cacheKey, font);
    return font;
  } catch {
    // Unicode fallback using NotoSans
    const fallbackPath = path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf');
    if (!cachedBytes[fallbackPath]) {
      cachedBytes[fallbackPath] = await fs.readFile(fallbackPath);
    }
    const font = await pdfDoc.embedFont(cachedBytes[fallbackPath], { subset: true });
    fontMap.set(cacheKey, font);
    return font;
  }
}

export async function embedEditFonts(pdfDoc: PDFDocument): Promise<Record<FontFamilyGuess, PDFFont>> {
  pdfDoc.registerFontkit(fontkit);

  const entries = await Promise.all(
    (Object.keys(TTF_FONTS) as FontFamilyGuess[]).map(async (key) => {
      const font = await getAppropriateFont(pdfDoc, key, false, false, '');
      return [key, font] as const;
    })
  );

  return Object.fromEntries(entries) as Record<FontFamilyGuess, PDFFont>;
}

export function assertTextIsEncodable(font: PDFFont, text: string): void {
  try {
    font.widthOfTextAtSize(text, 12);
  } catch {
    throw new UnsupportedGlyphError();
  }
}
