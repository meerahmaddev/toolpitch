'use client';

import { useRef, useState } from 'react';
import { UploadCloud, FileText } from 'lucide-react';
import { message } from '@/utils/message';
import { api } from '@/utils/apiClient';
import { FILE_SIZE_LIMITS_MB, FILE_SIZE_LIMIT_BYTES } from '@/utils/fileLimits';
import { useRejectFlash } from '@/utils/useRejectFlash';
import ProcessingOverlay from './ProcessingOverlay';
import { useDownloadGuard } from '@/hooks/useDownloadGuard';
import PdfPageCanvas, { rectPxFromBboxPdf, type PageImageState, type ViewportLike } from './editPdf/PdfPageCanvas';
import EditPdfToolbar, { type FormattingState } from './editPdf/EditPdfToolbar';
import { extractLines, clusterLinesIntoBlocks, calculateReflowDisplacements, mostCommon, type TextBlock, type EditedBlock, type RawTextItem } from '@/lib/converter/pdfTextBlocks';
import { extractImageObjects, type ImageObject, type MovedImage, type PdfOpsCodes } from '@/lib/converter/pdfImageObjects';
import './EditPdfZone.css';

const RENDER_SCALE = 1.5;
const BG_SAMPLE_OFFSET = 3;
// Matches the 10MB PDF cap enforced server-side (assertFileSizeAllowed in
// lib/converter/validation.ts, checked again in app/api/converter/edit-pdf/route.ts).
const MAX_PDF_SIZE_MB = FILE_SIZE_LIMITS_MB.pdf;
const MAX_PDF_SIZE_BYTES = FILE_SIZE_LIMIT_BYTES.pdf;

// Minimal shape covering pdf.js's TextItem | TextMarkedContent union - narrowed by the
// `typeof item.str === 'string'` filter below (TextMarkedContent has no `str`).
interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

interface PageData {
  pageIndex: number;
  canvasDataUrl: string;
  widthPx: number;
  heightPx: number;
  viewport: ViewportLike;
  blocks: TextBlock[];
  images: Array<ImageObject & { thumbnailSrc: string | null; bgColorHex: string }>;
}

function sampleBgColor(ctx: CanvasRenderingContext2D, rectPx: { left: number; top: number; width: number; height: number }, canvasWidth: number, canvasHeight: number): string {
  try {
    const probeX = Math.max(0, Math.min(Math.round(rectPx.left - BG_SAMPLE_OFFSET), canvasWidth - 1));
    const probeY = Math.max(0, Math.min(Math.round(rectPx.top + rectPx.height / 2), canvasHeight - 1));
    const [r, g, b] = ctx.getImageData(probeX, probeY, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return '#FFFFFF';
  }
}

function sampleTextColor(
  ctx: CanvasRenderingContext2D,
  rectPx: { left: number; top: number; width: number; height: number },
  bgColorHex: string,
  canvasWidth: number,
  canvasHeight: number
): string {
  try {
    const rx = Math.max(0, Math.min(Math.round(rectPx.left), canvasWidth - 1));
    const ry = Math.max(0, Math.min(Math.round(rectPx.top), canvasHeight - 1));
    const rw = Math.max(1, Math.min(Math.round(rectPx.width), canvasWidth - rx));
    const rh = Math.max(1, Math.min(Math.round(rectPx.height), canvasHeight - ry));

    const imgData = ctx.getImageData(rx, ry, rw, rh).data;
    const bgR = parseInt(bgColorHex.slice(1, 3), 16) || 255;
    const bgG = parseInt(bgColorHex.slice(3, 5), 16) || 255;
    const bgB = parseInt(bgColorHex.slice(5, 7), 16) || 255;

    let maxDiff = 0;
    let textR = 0;
    let textG = 0;
    let textB = 0;

    const step = Math.max(1, Math.floor((rw * rh) / 80));
    for (let i = 0; i < imgData.length; i += step * 4) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (diff > maxDiff) {
        maxDiff = diff;
        textR = r;
        textG = g;
        textB = b;
      }
    }

    if (maxDiff > 35) {
      return `#${[textR, textG, textB].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
    return '#000000';
  } catch {
    return '#000000';
  }
}

function cropThumbnail(source: HTMLCanvasElement, rect: { left: number; top: number; width: number; height: number }): string | null {
  if (rect.width < 1 || rect.height < 1) return null;
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(rect.width));
  off.height = Math.max(1, Math.round(rect.height));
  const octx = off.getContext('2d');
  if (!octx) return null;
  octx.drawImage(source, rect.left, rect.top, rect.width, rect.height, 0, 0, off.width, off.height);
  return off.toDataURL('image/png');
}

const EditPdfZone = () => {
  const { requireAuthToDownload } = useDownloadGuard();
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isAddTextMode, setIsAddTextMode] = useState(false);
  const [editedText, setEditedText] = useState<Record<string, string>>({});
  const [formattingOverrides, setFormattingOverrides] = useState<Record<string, Partial<FormattingState>>>({});
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [imagePositions, setImagePositions] = useState<Record<string, { leftPx: number; topPx: number }>>({});
  const [overflowIds, setOverflowIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { flashClass, triggerReject } = useRejectFlash();

  const loadPdf = async (selected: File) => {
    setLoading(true);
    message.loading({ content: 'Reading PDF and finding editable text...', key: 'load-edit-pdf', duration: 0 });

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      const opsCodes: PdfOpsCodes = {
        save: pdfjsLib.OPS.save,
        restore: pdfjsLib.OPS.restore,
        transform: pdfjsLib.OPS.transform,
        paintImageXObject: pdfjsLib.OPS.paintImageXObject,
        paintImageMaskXObject: pdfjsLib.OPS.paintImageMaskXObject,
        paintFormXObjectBegin: pdfjsLib.OPS.paintFormXObjectBegin,
        paintFormXObjectEnd: pdfjsLib.OPS.paintFormXObjectEnd,
      };

      const arrayBuffer = await selected.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const loadedPages: PageData[] = [];

      // On mobile, calculate a scale that fits the PDF within the available screen
      // width, so blocks and text stay proportionally correct without any overflow.
      // On desktop we keep RENDER_SCALE (1.5) for crisp rendering quality.
      const containerWidth = Math.min(window.innerWidth, 1000) - 48; // subtract padding
      const firstPage = await pdf.getPage(1);
      const baseViewport = firstPage.getViewport({ scale: 1 });
      const mobileScale = containerWidth / baseViewport.width;
      const renderScale = window.innerWidth <= 700 ? Math.min(RENDER_SCALE, mobileScale) : RENDER_SCALE;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;

        const textContent = await page.getTextContent();
        const styles = (textContent.styles as Record<string, { fontFamily?: string }>) || {};
        const rawItems: RawTextItem[] = (textContent.items as PdfTextItem[])
          .filter((item): item is PdfTextItem & { str: string } => typeof item.str === 'string')
          .map((item) => {
            const fontKey = item.fontName ?? '';
            const styleFamily = styles[fontKey]?.fontFamily ?? '';
            const fullFontName = `${fontKey} ${styleFamily}`;
            return {
              str: item.str,
              transform: item.transform ?? [1, 0, 0, 1, 0, 0],
              width: item.width ?? 0,
              height: item.height ?? 0,
              fontName: fullFontName,
            };
          });

        const lines = extractLines(rawItems);
        const blocks = clusterLinesIntoBlocks(lines, i - 1).map((block) => {
          const rectPx = rectPxFromBboxPdf(viewport, block.bboxPdf);
          const bg = sampleBgColor(ctx, rectPx, canvas.width, canvas.height);
          const textColor = sampleTextColor(ctx, rectPx, bg, canvas.width, canvas.height);
          return { ...block, bgColorHex: bg, textColorHex: textColor };
        });

        const opList = await page.getOperatorList();
        // @ts-ignore
        const pageAreaPdf = (page.view[2] - page.view[0]) * (page.view[3] - page.view[1]);
        const extractedImages = extractImageObjects(opList, i - 1, opsCodes)
          .filter((image) => {
            const imgArea = image.bboxPdf.width * image.bboxPdf.height;
            return imgArea < pageAreaPdf * 0.6;
          })
          .map((image) => {
            const rectPx = rectPxFromBboxPdf(viewport, image.bboxPdf);
            const thumb = cropThumbnail(canvas, rectPx);
            const bg = sampleBgColor(ctx, rectPx, canvas.width, canvas.height);
            return { ...image, thumbnailSrc: thumb, bgColorHex: bg };
          });

        loadedPages.push({
          pageIndex: i - 1,
          canvasDataUrl: canvas.toDataURL('image/png'),
          widthPx: viewport.width,
          heightPx: viewport.height,
          viewport: {
            scale: viewport.scale,
            convertToViewportPoint: (x, y) => viewport.convertToViewportPoint(x, y),
            convertToPdfPoint: (x, y) => viewport.convertToPdfPoint(x, y),
          },
          blocks,
          images: extractedImages,
        });
      }

      // Calculate dominant font family across the entire PDF for 100% typographic consistency
      const allFamilies = loadedPages.flatMap((p) => p.blocks.map((b) => b.fontFamilyGuess));
      const dominantFamily = allFamilies.length > 0 ? mostCommon(allFamilies) : 'arial';
      for (const p of loadedPages) {
        for (const b of p.blocks) {
          b.fontFamilyGuess = dominantFamily;
        }
      }

      setPages(loadedPages);
      setFile(selected);
      setEditedText({});
      setFormattingOverrides({});
      setSelectedBlockId(null);
      setImagePositions({});
      setPageIndex(0);
      setIsAddTextMode(false);
      message.success({ content: `Loaded ${loadedPages.length} page(s) successfully!`, key: 'load-edit-pdf' });
    } catch (error) {
      console.error(error);
      message.error({ content: (error instanceof Error && error.message) || 'Failed to read PDF', key: 'load-edit-pdf' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;

    if (selected.type !== 'application/pdf') {
      message.error('Please select a valid PDF file.');
      triggerReject();
      return;
    }

    if (selected.size > MAX_PDF_SIZE_BYTES) {
      message.error(`File "${selected.name}" is too large! Maximum ${MAX_PDF_SIZE_MB}MB allowed.`);
      triggerReject();
      return;
    }

    loadPdf(selected);
  };

  const handleTextChange = (blockId: string, text: string) => {
    setEditedText((prev) => ({ ...prev, [blockId]: text }));
  };

  const handleFormatChange = (updates: Partial<FormattingState>) => {
    if (!selectedBlockId) return;
    setFormattingOverrides((prev) => ({
      ...prev,
      [selectedBlockId]: {
        ...prev[selectedBlockId],
        ...updates,
      },
    }));
  };

  const handleCanvasAddText = (pdfPoint: { x: number; y: number }) => {
    const currentPage = pages[pageIndex];
    if (!currentPage) return;

    const newBlockId = `custom-p${pageIndex}-${Date.now()}`;
    const newBlock: TextBlock = {
      id: newBlockId,
      pageIndex,
      bboxPdf: {
        x: Math.max(10, Math.round(pdfPoint.x)),
        y: Math.max(10, Math.round(pdfPoint.y - 18)),
        width: 180,
        height: 24,
      },
      originalText: 'New text',
      fontSizePdf: 14,
      lineHeightPdf: 17,
      fontFamilyGuess: 'arial',
      fontBold: false,
      fontItalic: false,
      bgColorHex: '#FFFFFF',
      textColorHex: '#000000',
      rotated: false,
      lowConfidence: false,
      nonEditable: false,
      isCustomAdded: true,
    };

    setPages((prev) => {
      const next = [...prev];
      next[pageIndex] = {
        ...next[pageIndex],
        blocks: [...next[pageIndex].blocks, newBlock],
      };
      return next;
    });

    setEditedText((prev) => ({ ...prev, [newBlockId]: 'New text' }));
    setSelectedBlockId(newBlockId);
    setIsAddTextMode(false);
    message.success({ content: 'Text box added! Type your content and edit styling.', key: 'add-text' });
  };

  const handleBlockMove = (blockId: string, dxPx: number, dyPx: number) => {
    const curPage = pages[pageIndex];
    if (!curPage) return;

    setPages((prev) => {
      const next = [...prev];
      const page = next[pageIndex];
      if (!page) return prev;

      const pdfDx = dxPx / page.viewport.scale;
      const pdfDy = -dyPx / page.viewport.scale;

      const updatedBlocks = page.blocks.map((b) => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          bboxPdf: {
            ...b.bboxPdf,
            x: Math.max(0, b.bboxPdf.x + pdfDx),
            y: Math.max(0, b.bboxPdf.y + pdfDy),
          },
        };
      });

      next[pageIndex] = { ...page, blocks: updatedBlocks };
      return next;
    });
  };

  const handleBlockDelete = (blockId: string) => {
    const curPage = pages[pageIndex];
    if (!curPage) return;
    const targetBlock = curPage.blocks.find((b) => b.id === blockId);
    if (!targetBlock) return;

    if (targetBlock.isCustomAdded) {
      setPages((prev) => {
        const next = [...prev];
        const page = next[pageIndex];
        if (!page) return prev;
        next[pageIndex] = {
          ...page,
          blocks: page.blocks.filter((b) => b.id !== blockId),
        };
        return next;
      });
      setEditedText((prev) => {
        const copy = { ...prev };
        delete copy[blockId];
        return copy;
      });
      setFormattingOverrides((prev) => {
        const copy = { ...prev };
        delete copy[blockId];
        return copy;
      });
      if (selectedBlockId === blockId) setSelectedBlockId(null);
      message.success('Text box deleted!');
    } else {
      // Existing PDF block -> erase text
      setEditedText((prev) => ({ ...prev, [blockId]: '' }));
      if (selectedBlockId === blockId) setSelectedBlockId(null);
      message.success('Text erased from PDF!');
    }
  };

  const handleImageMove = (imageId: string, dxPx: number, dyPx: number) => {
    const page = pages[pageIndex];
    const image = page?.images.find((im) => im.id === imageId);
    if (!image) return;
    const original = rectPxFromBboxPdf(page.viewport, image.bboxPdf);
    setImagePositions((prev) => {
      const current = prev[imageId] ?? { leftPx: original.left, topPx: original.top };
      return { ...prev, [imageId]: { leftPx: current.leftPx + dxPx, topPx: current.topPx + dyPx } };
    });
  };

  const hasChanges =
    pages.some((page) =>
      page.blocks.some(
        (b) =>
          b.isCustomAdded ||
          (editedText[b.id] !== undefined && editedText[b.id] !== b.originalText) ||
          formattingOverrides[b.id] !== undefined
      )
    ) || Object.keys(imagePositions).length > 0;

  const allBlocks = pages.flatMap((p) => p.blocks);
  const rawActiveBlock = selectedBlockId ? allBlocks.find((b) => b.id === selectedBlockId) ?? null : null;
  const activeBlock = rawActiveBlock
    ? {
        ...rawActiveBlock,
        ...(formattingOverrides[rawActiveBlock.id] || {}),
      }
    : null;

  const handleSave = () => {
    if (!file) return;

    requireAuthToDownload(async () => {
      setSaving(true);
      message.loading({ content: 'Saving edited PDF with layout reflow...', key: 'save-edit-pdf' });

      try {
        const edits: EditedBlock[] = [];
        for (const page of pages) {
          const displacements = calculateReflowDisplacements(page.blocks, editedText);

          for (const block of page.blocks) {
            if (block.nonEditable) continue;
            const newText = editedText[block.id] ?? block.originalText;
            const overrides = formattingOverrides[block.id];
            const isTextChanged = editedText[block.id] !== undefined && editedText[block.id] !== block.originalText;
            const isFormatChanged = overrides !== undefined;
            const disp = displacements[block.id];
            const isDisplaced = disp?.isDisplaced ?? false;

            // Skip untouched, non-displaced, non-custom blocks
            if (!isTextChanged && !isFormatChanged && !isDisplaced && !block.isCustomAdded) continue;

            edits.push({
              id: block.id,
              pageIndex: block.pageIndex,
              bboxPdf: disp ? disp.newBboxPdf : block.bboxPdf,
              originalBboxPdf: block.bboxPdf,
              newText,
              fontSizePdf: overrides?.fontSizePdf ?? block.fontSizePdf,
              fontFamilyGuess: overrides?.fontFamilyGuess ?? block.fontFamilyGuess,
              fontBold: overrides?.fontBold ?? block.fontBold,
              fontItalic: overrides?.fontItalic ?? block.fontItalic,
              bgColorHex: block.bgColorHex,
              textColorHex: overrides?.textColorHex ?? block.textColorHex,
              isCustomAdded: block.isCustomAdded,
              isDisplaced,
            });
          }
        }

        const movedImages: MovedImage[] = [];
        for (const page of pages) {
          for (const image of page.images) {
            const override = imagePositions[image.id];
            if (!override) continue;
            const original = rectPxFromBboxPdf(page.viewport, image.bboxPdf);
            if (override.leftPx === original.left && override.topPx === original.top) continue;
            const [newX, newY] = page.viewport.convertToPdfPoint(override.leftPx, override.topPx + original.height) as [number, number];
            movedImages.push({
              id: image.id,
              pageIndex: image.pageIndex,
              bboxPdf: image.bboxPdf,
              newX,
              newY,
              bgColorHex: image.bgColorHex,
            });
          }
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('edits', JSON.stringify(edits));
        formData.append('movedImages', JSON.stringify(movedImages));

        const response = await api.editPdf(formData);
        setOverflowIds(response.overflowIds);

        const url = window.URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Edited_${file.name}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        message.success({ content: 'PDF saved and downloaded!', key: 'save-edit-pdf' });
      } catch (error) {
        message.error({ content: (error instanceof Error && error.message) || 'Failed to save edited PDF', key: 'save-edit-pdf' });
      } finally {
        setSaving(false);
      }
    });
  };

  if (!file || pages.length === 0) {
    return (
      <div className="edit-pdf-container fade-in">
        <div className={`tool-drop-zone ${flashClass}`} onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={64} className="zone-icon" />
          <h2 className="zone-title">Select a PDF to edit</h2>
          <p className="zone-subtitle">Click into text to edit it in place, or drag images to reposition them</p>
          <p className="zone-subtitle" style={{ fontSize: '0.85rem', opacity: 0.7 }}>Maximum file size: {MAX_PDF_SIZE_MB}MB</p>
          <button className="split-btn-main mt-4">CHOOSE FILE</button>
        </div>
        <input type="file" accept=".pdf,application/pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
        <ProcessingOverlay isVisible={loading} text="Reading PDF and finding editable text..." />
      </div>
    );
  }

  const currentPage = pages[pageIndex];
  const imagesWithPosition: PageImageState[] = currentPage.images.map((image) => {
    const original = rectPxFromBboxPdf(currentPage.viewport, image.bboxPdf);
    const override = imagePositions[image.id];
    return { ...image, currentLeftPx: override?.leftPx ?? original.left, currentTopPx: override?.topPx ?? original.top };
  });

  return (
    <div className="edit-pdf-container fade-in">
      <EditPdfToolbar
        pageIndex={pageIndex}
        pageCount={pages.length}
        onPageChange={setPageIndex}
        onSave={handleSave}
        saving={saving}
        hasChanges={hasChanges}
        overflowCount={overflowIds.length}
        activeBlock={activeBlock}
        isAddTextMode={isAddTextMode}
        onToggleAddText={() => setIsAddTextMode((prev) => !prev)}
        onFormatChange={handleFormatChange}
        onDeleteBlock={handleBlockDelete}
      />


      <div className="edit-pdf-scroll-wrapper" id="edit-pdf-canvas-outer">
        <PdfPageCanvas
          canvasDataUrl={currentPage.canvasDataUrl}
          widthPx={currentPage.widthPx}
          heightPx={currentPage.heightPx}
          viewport={currentPage.viewport}
          blocks={currentPage.blocks}
          images={imagesWithPosition}
          editedText={editedText}
          formattingOverrides={formattingOverrides}
          isAddTextMode={isAddTextMode}
          selectedBlockId={selectedBlockId}
          onCanvasClick={handleCanvasAddText}
          onSelectBlock={setSelectedBlockId}
          onTextChange={handleTextChange}
          onMoveBlock={handleBlockMove}
          onDeleteBlock={handleBlockDelete}
          onImageMove={handleImageMove}
        />
      </div>

      {currentPage.blocks.length === 0 && (
        <p style={{ textAlign: 'center', opacity: 0.6, marginTop: 12 }}>
          <FileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          No editable text detected on this page.
        </p>
      )}

      <ProcessingOverlay isVisible={saving} text="Saving edited PDF..." />
    </div>
  );
};

export default EditPdfZone;
