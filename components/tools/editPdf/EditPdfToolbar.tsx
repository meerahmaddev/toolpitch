'use client';

import { ChevronLeft, ChevronRight, Download, AlertTriangle, Bold, Italic, Minus, Plus, Palette, Type, Trash2 } from 'lucide-react';
import type { FontFamilyGuess, TextBlock } from '@/lib/converter/pdfTextBlocks';

export interface FormattingState {
  fontFamilyGuess: FontFamilyGuess;
  fontSizePdf: number;
  fontBold: boolean;
  fontItalic: boolean;
  textColorHex: string;
}

interface Props {
  pageIndex: number;
  pageCount: number;
  onPageChange: (index: number) => void;
  onSave: () => void;
  saving: boolean;
  hasChanges: boolean;
  overflowCount: number;
  activeBlock: (TextBlock & Partial<FormattingState>) | null;
  isAddTextMode?: boolean;
  onToggleAddText?: () => void;
  onFormatChange?: (updates: Partial<FormattingState>) => void;
  onDeleteBlock?: (blockId: string) => void;
}

const EditPdfToolbar = ({
  pageIndex,
  pageCount,
  onPageChange,
  onSave,
  saving,
  hasChanges,
  overflowCount,
  activeBlock,
  isAddTextMode,
  onToggleAddText,
  onFormatChange,
  onDeleteBlock,
}: Props) => {
  const currentFamily = activeBlock?.fontFamilyGuess || 'arial';
  const currentSize = activeBlock ? Math.round(activeBlock.fontSizePdf) : 14;
  const isBold = activeBlock?.fontBold ?? false;
  const isItalic = activeBlock?.fontItalic ?? false;
  const currentColor = activeBlock?.textColorHex || '#000000';

  return (
    <div className="edit-pdf-toolbar">
      {/* Page Navigation */}
      <div className="edit-pdf-toolbar-group">
        <button className="edit-pdf-nav-btn" title="Previous Page" disabled={pageIndex === 0} onClick={() => onPageChange(pageIndex - 1)}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 70, textAlign: 'center' }}>
          Page {pageIndex + 1} of {pageCount}
        </span>
        <button className="edit-pdf-nav-btn" title="Next Page" disabled={pageIndex === pageCount - 1} onClick={() => onPageChange(pageIndex + 1)}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="edit-pdf-toolbar-divider" />

      {/* Add Text Tool */}
      <button
        className={`edit-pdf-tool-btn edit-pdf-add-text-btn ${isAddTextMode ? 'active' : ''}`}
        onClick={onToggleAddText}
        title={isAddTextMode ? 'Click on PDF to place text box' : 'Add New Text Box'}
      >
        <Type size={16} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>Add Text</span>
      </button>

      <div className="edit-pdf-toolbar-divider" />

      {/* Formatting Tools (Active when text block is selected) */}
      <div className={`edit-pdf-toolbar-group ${!activeBlock ? 'toolbar-disabled' : ''}`}>
        {/* Font Family Selector */}
        <select
          className="edit-pdf-select"
          disabled={!activeBlock}
          value={currentFamily}
          onChange={(e) => onFormatChange?.({ fontFamilyGuess: e.target.value as FontFamilyGuess })}
          title="Font Family"
        >
          <option value="arial">Arial / Sans</option>
          <option value="calibri">Calibri</option>
          <option value="times">Times New Roman</option>
          <option value="mono">Courier / Monospace</option>
        </select>

        {/* Font Size Decrement / Increment */}
        <div className="edit-pdf-size-group">
          <button
            className="edit-pdf-tool-btn"
            disabled={!activeBlock || currentSize <= 6}
            onClick={() => onFormatChange?.({ fontSizePdf: Math.max(6, currentSize - 1) })}
            title="Decrease Font Size"
          >
            <Minus size={14} />
          </button>
          <span className="edit-pdf-size-label">{currentSize} pt</span>
          <button
            className="edit-pdf-tool-btn"
            disabled={!activeBlock || currentSize >= 72}
            onClick={() => onFormatChange?.({ fontSizePdf: Math.min(72, currentSize + 1) })}
            title="Increase Font Size"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Bold Toggle */}
        <button
          className={`edit-pdf-tool-btn ${isBold ? 'active' : ''}`}
          disabled={!activeBlock}
          onClick={() => onFormatChange?.({ fontBold: !isBold })}
          title="Bold (B)"
        >
          <Bold size={16} />
        </button>

        {/* Italic Toggle */}
        <button
          className={`edit-pdf-tool-btn ${isItalic ? 'active' : ''}`}
          disabled={!activeBlock}
          onClick={() => onFormatChange?.({ fontItalic: !isItalic })}
          title="Italic (I)"
        >
          <Italic size={16} />
        </button>

        {/* Text Color Picker */}
        <label className={`edit-pdf-color-picker-label ${!activeBlock ? 'disabled' : ''}`} title="Text Color">
          <Palette size={16} style={{ color: currentColor }} />
          <input
            type="color"
            className="edit-pdf-color-input"
            disabled={!activeBlock}
            value={currentColor}
            onChange={(e) => onFormatChange?.({ textColorHex: e.target.value })}
          />
        </label>

        {/* Delete Box / Erase Button */}
        <button
          className="edit-pdf-tool-btn edit-pdf-delete-tool-btn"
          disabled={!activeBlock}
          onClick={() => activeBlock && onDeleteBlock?.(activeBlock.id)}
          title={activeBlock?.isCustomAdded ? 'Delete Text Box' : 'Erase Text'}
        >
          <Trash2 size={15} style={{ color: activeBlock ? '#ef4444' : 'inherit' }} />
        </button>
      </div>

      <div className="edit-pdf-toolbar-divider" />

      {overflowCount > 0 && (
        <div className="edit-pdf-overflow-banner">
          <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          {overflowCount} block{overflowCount > 1 ? 's' : ''} adjusted to fit.
        </div>
      )}

      {/* Save Button */}
      <button className="edit-pdf-save-btn" onClick={onSave} disabled={saving || !hasChanges}>
        <Download size={16} />
        {saving ? 'Saving...' : 'Save & Download'}
      </button>
    </div>
  );
};

export default EditPdfToolbar;
