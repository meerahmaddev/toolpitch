'use client';

import { useMemo } from 'react';
import { calculateReflowDisplacements, type TextBlock } from '@/lib/converter/pdfTextBlocks';
import type { ImageObject } from '@/lib/converter/pdfImageObjects';
import EditableBlock from './EditableBlock';
import DraggableImage from './DraggableImage';

export interface PageImageState extends ImageObject {
  thumbnailSrc: string | null;
  bgColorHex: string;
  currentLeftPx: number;
  currentTopPx: number;
}

// Minimal shape of pdf.js's PageViewport we rely on - avoids importing pdfjs-dist types
// into a component tree that only needs two coordinate-mapping methods.
export interface ViewportLike {
  scale: number;
  convertToViewportPoint(x: number, y: number): number[];
  convertToPdfPoint(x: number, y: number): number[];
}

import type { FormattingState } from './EditPdfToolbar';

interface Props {
  canvasDataUrl: string;
  widthPx: number;
  heightPx: number;
  viewport: ViewportLike;
  blocks: TextBlock[];
  images: PageImageState[];
  editedText: Record<string, string>;
  formattingOverrides: Record<string, Partial<FormattingState>>;
  isAddTextMode?: boolean;
  selectedBlockId?: string | null;
  onCanvasClick?: (pdfPoint: { x: number; y: number }, pxPoint: { left: number; top: number }) => void;
  onSelectBlock: (blockId: string) => void;
  onTextChange: (blockId: string, text: string) => void;
  onMoveBlock?: (blockId: string, deltaLeftPx: number, deltaTopPx: number) => void;
  onDeleteBlock?: (blockId: string) => void;
  onImageMove: (imageId: string, deltaLeftPx: number, deltaTopPx: number) => void;
}

export function rectPxFromBboxPdf(viewport: ViewportLike, bboxPdf: { x: number; y: number; width: number; height: number }) {
  const [leftPx, topPx] = viewport.convertToViewportPoint(bboxPdf.x, bboxPdf.y + bboxPdf.height);
  const [rightPx, bottomPx] = viewport.convertToViewportPoint(bboxPdf.x + bboxPdf.width, bboxPdf.y);
  return { left: leftPx, top: topPx, width: rightPx - leftPx, height: bottomPx - topPx };
}

const PdfPageCanvas = ({
  canvasDataUrl,
  widthPx,
  heightPx,
  viewport,
  blocks,
  images,
  editedText,
  formattingOverrides,
  isAddTextMode,
  selectedBlockId,
  onCanvasClick,
  onSelectBlock,
  onTextChange,
  onMoveBlock,
  onDeleteBlock,
  onImageMove,
}: Props) => {
  // Calculate dynamic reflow displacements for all blocks on this page in real-time
  const displacements = useMemo(() => {
    return calculateReflowDisplacements(blocks, editedText);
  }, [blocks, editedText]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAddTextMode || !onCanvasClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const [pdfX, pdfY] = viewport.convertToPdfPoint(clickX, clickY);
    onCanvasClick({ x: pdfX, y: pdfY }, { left: clickX, top: clickY });
  };

  return (
    <div
      className={`edit-pdf-page-wrapper ${isAddTextMode ? 'add-text-active' : ''}`}
      style={{ width: widthPx, height: heightPx }}
      onClick={handleCanvasClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={canvasDataUrl} alt="" className="edit-pdf-page-canvas" draggable={false} />

      {images.map((image) => {
        const originalRectPx = rectPxFromBboxPdf(viewport, image.bboxPdf);
        const currentRectPx = { ...originalRectPx, left: image.currentLeftPx, top: image.currentTopPx };
        const moved = image.currentLeftPx !== originalRectPx.left || image.currentTopPx !== originalRectPx.top;
        return (
          <DraggableImage
            key={image.id}
            imageId={image.id}
            originalRectPx={originalRectPx}
            currentRectPx={currentRectPx}
            thumbnailSrc={image.thumbnailSrc}
            bgColorHex={image.bgColorHex}
            moved={moved}
            onMove={onImageMove}
          />
        );
      })}

      {/* Render background erasure patches for all blocks that have been shifted downwards */}
      {blocks.map((block) => {
        const disp = displacements[block.id];
        if (!disp || !disp.isDisplaced || block.isCustomAdded) return null;
        const origRectPx = rectPxFromBboxPdf(viewport, block.bboxPdf);
        return (
          <div
            key={`patch-${block.id}`}
            className="reflow-whiteout-patch"
            style={{
              position: 'absolute',
              left: origRectPx.left - 1,
              top: origRectPx.top - 1,
              width: origRectPx.width + 2,
              height: origRectPx.height + 2,
              background: block.bgColorHex || '#FFFFFF',
              zIndex: 5,
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* Render all editable blocks with their dynamic shifted top positions */}
      {blocks.map((block) => {
        const origRectPx = rectPxFromBboxPdf(viewport, block.bboxPdf);
        const disp = displacements[block.id];
        const shiftPx = disp ? disp.shiftYPt * viewport.scale : 0;
        const deltaHeightPx = disp ? disp.deltaHeightPt * viewport.scale : 0;

        const dynamicRectPx = {
          left: origRectPx.left,
          top: origRectPx.top + shiftPx,
          width: origRectPx.width,
          height: origRectPx.height + deltaHeightPx,
        };

        const isEdited = (editedText[block.id] !== undefined && editedText[block.id] !== block.originalText) || (disp?.isDisplaced ?? false);

        return (
          <EditableBlock
            key={block.id}
            block={block}
            rectPx={dynamicRectPx}
            fontSizePx={block.fontSizePdf * viewport.scale}
            initialText={editedText[block.id] ?? block.originalText}
            isEdited={isEdited}
            isSelected={selectedBlockId === block.id}
            formatOverride={formattingOverrides[block.id]}
            maxWidthPx={widthPx - dynamicRectPx.left - 20}
            onSelect={onSelectBlock}
            onChange={onTextChange}
            onMove={onMoveBlock}
            onDelete={onDeleteBlock}
          />
        );
      })}
    </div>
  );
};

export default PdfPageCanvas;
