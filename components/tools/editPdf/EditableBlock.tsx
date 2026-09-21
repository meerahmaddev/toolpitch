'use client';

import { useEffect, useRef, useState } from 'react';
import { Move, Trash2 } from 'lucide-react';
import type { TextBlock } from '@/lib/converter/pdfTextBlocks';
import type { FormattingState } from './EditPdfToolbar';

const FONT_FAMILY_CSS: Record<string, string> = {
  arial: "Inter, Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  calibri: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif",
  times: "'Times New Roman', Times, Georgia, serif",
  sans: "Inter, Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  serif: "'Times New Roman', Times, serif",
  mono: "'Courier New', Courier, monospace",
};

interface Props {
  block: TextBlock;
  rectPx: { left: number; top: number; width: number; height: number };
  fontSizePx: number;
  initialText: string;
  isEdited: boolean;
  isSelected?: boolean;
  maxWidthPx?: number;
  formatOverride?: Partial<FormattingState>;
  onSelect?: (blockId: string) => void;
  onChange: (blockId: string, newText: string) => void;
  onMove?: (blockId: string, dxPx: number, dyPx: number) => void;
  onDelete?: (blockId: string) => void;
}

const EditableBlock = ({
  block,
  rectPx,
  fontSizePx,
  initialText,
  isEdited,
  isSelected,
  maxWidthPx,
  formatOverride,
  onSelect,
  onChange,
  onMove,
  onDelete,
}: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerText !== initialText) {
      ref.current.innerText = initialText;
    }
  }, [initialText, block.id]);

  const isActive = isFocused || isEdited || isSelected;
  const showControls = isFocused || isSelected;

  const effectiveFamily = formatOverride?.fontFamilyGuess || block.fontFamilyGuess;
  const effectiveBold = formatOverride?.fontBold ?? block.fontBold;
  const effectiveItalic = formatOverride?.fontItalic ?? block.fontItalic;
  const effectiveColor = formatOverride?.textColorHex || block.textColorHex || '#000000';
  const effectiveFontSizePx = formatOverride?.fontSizePdf
    ? formatOverride.fontSizePdf * (fontSizePx / block.fontSizePdf)
    : fontSizePx;

  const handleDragPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    onSelect?.(block.id);
  };

  const handleDragPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (dx === 0 && dy === 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    onMove?.(block.id, dx, dy);
  };

  const handleDragPointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    dragStart.current = null;
    setDragging(false);
  };

  return (
    <div
      className={`edit-pdf-block-container ${showControls ? 'active-selected' : ''}`}
      style={{
        position: 'absolute',
        left: rectPx.left,
        top: rectPx.top,
        zIndex: showControls ? 25 : 10,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(block.id);
      }}
    >
      {showControls && (
        <div className="edit-pdf-block-actions" contentEditable={false} suppressContentEditableWarning>
          <div
            className="edit-pdf-block-drag-handle"
            title="Drag to move text box"
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
          >
            <Move size={11} />
            <span>Move</span>
          </div>
          <button
            type="button"
            className="edit-pdf-block-delete-btn"
            title={block.isCustomAdded ? 'Delete text box' : 'Erase text'}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete?.(block.id);
            }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      <div
        ref={ref}
        className={`edit-pdf-block ${isFocused ? 'active-focused' : isEdited ? 'edited-committed' : 'idle-overlay'} ${block.lowConfidence ? 'table-cell-block' : ''}`}
        contentEditable
        suppressContentEditableWarning
        style={{
          minWidth: Math.max(12, rectPx.width),
          width: 'max-content',
          maxWidth: maxWidthPx ? Math.max(rectPx.width, maxWidthPx) : '90%',
          minHeight: Math.max(12, rectPx.height),
          fontSize: effectiveFontSizePx,
          fontFamily: FONT_FAMILY_CSS[effectiveFamily] || FONT_FAMILY_CSS.calibri,
          fontWeight: effectiveBold ? 700 : 400,
          fontStyle: effectiveItalic ? 'italic' : 'normal',
          color: isActive ? effectiveColor : 'transparent',
          background: isActive ? block.bgColorHex : 'transparent',
          textAlign: 'left',
        }}
        onFocus={() => {
          setIsFocused(true);
          onSelect?.(block.id);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          const currentVal = e.currentTarget.innerText;
          if (currentVal !== block.originalText) {
            onChange(block.id, currentVal);
          }
        }}
        onInput={(e) => onChange(block.id, e.currentTarget.innerText)}
      />
    </div>
  );
};

export default EditableBlock;
