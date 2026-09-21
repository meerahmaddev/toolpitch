'use client';

import { useState, useRef } from 'react';
import { UploadCloud, FileText, Plus, X, DownloadCloud, CheckCircle2 } from 'lucide-react';
import { message } from '@/utils/message';
import { api } from '@/utils/apiClient';
import { FILE_SIZE_LIMITS_MB, FILE_SIZE_LIMIT_BYTES } from '@/utils/fileLimits';
import { useRejectFlash } from '@/utils/useRejectFlash';
import ProcessingOverlay from './ProcessingOverlay';
import { useDownloadGuard } from '@/hooks/useDownloadGuard';
import './MergePdfZone.css';
import './ImagesToPdfZone.css'; // Reuse scanner grid styles
import './CompressPdfZone.css'; // Reuse the .compression-settings results-card style

interface MergeItem {
  file: File;
  fileSizeStr: string;
  imageUrl: string | null;
  id: string;
}

interface MergeResult {
  blob: Blob;
  fileCount: number;
}

// Matches the 10MB-per-PDF cap enforced server-side (assertFileSizeAllowed in
// lib/converter/validation.ts). Checked here too so an oversized file is rejected
// immediately on selection instead of only after the user picks every file, orders them,
// clicks Merge, and waits for the round trip to fail.
const MAX_PDF_SIZE_MB = FILE_SIZE_LIMITS_MB.pdf;
const MAX_PDF_SIZE_BYTES = FILE_SIZE_LIMIT_BYTES.pdf;

const MergePdfZone = () => {
  const { requireAuthToDownload } = useDownloadGuard();
  const [items, setItems] = useState<MergeItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const { flashClass, triggerReject } = useRejectFlash();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(2) + ' KB';
    const mb = kb / 1024;
    return mb.toFixed(2) + ' MB';
  };

  const loadThumbnail = async (file: File): Promise<string | null> => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (e) {
      console.error('Thumbnail generation failed', e);
      return null;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);

    const wrongType = newFiles.filter((f) => f.type !== 'application/pdf');
    if (wrongType.length > 0) {
      message.error('Only PDF files are allowed.');
      triggerReject();
    }

    const rightType = newFiles.filter((f) => f.type === 'application/pdf');
    const oversized = rightType.filter((f) => f.size > MAX_PDF_SIZE_BYTES);
    if (oversized.length > 0) {
      message.error(`Maximum ${MAX_PDF_SIZE_MB}MB per file. Too large: ${oversized.map((f) => f.name).join(', ')}`);
      triggerReject();
    }
    const validFiles = rightType.filter((f) => f.size <= MAX_PDF_SIZE_BYTES);
    if (validFiles.length === 0) {
      e.target.value = '';
      return;
    }

    message.loading({ content: 'Loading PDFs...', key: 'load-pdf', duration: 0 });

    const newItems: MergeItem[] = await Promise.all(
      validFiles.map(async (file) => {
        const imageUrl = await loadThumbnail(file);
        return {
          file,
          fileSizeStr: formatSize(file.size),
          imageUrl,
          id: Math.random().toString(36).substring(2, 11),
        };
      })
    );

    message.destroy('load-pdf');
    setItems((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const removeFile = (idToRemove: string) => {
    setItems(items.filter((item) => item.id !== idToRemove));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      (e.target as HTMLElement).classList.add('dragging');
    }, 0);
  };

  const handleDragEnter = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const newItems = [...items];
    const draggedItem = newItems[draggedIndex];
    newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);

    setDraggedIndex(targetIndex);
    setItems(newItems);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
    (e.target as HTMLElement).classList.remove('dragging');
  };

  const handleMerge = async () => {
    if (items.length < 2) {
      message.error('Please select at least 2 PDFs to merge.');
      return;
    }

    setIsProcessing(true);
    message.loading({ content: 'Merging PDFs...', key: 'merge-pdf' });

    try {
      const files = items.map((item) => item.file);

      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      formData.append('toolId', 'merge-pdf');

      const response = await api.mergePdfs(formData);

      setMergeResult({ blob: response.data, fileCount: items.length });
      message.success({ content: 'PDFs merged successfully!', key: 'merge-pdf' });
    } catch (error) {
      message.error({ content: (error instanceof Error && error.message) || 'Failed to merge PDFs', key: 'merge-pdf' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!mergeResult) return;

    requireAuthToDownload(() => {
      const url = window.URL.createObjectURL(mergeResult.blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Merged_Document_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.success('Download complete!');
    });
  };

  const resetAll = () => {
    setItems([]);
    setMergeResult(null);
  };

  return (
    <div className="merge-pdf-container fade-in">
      {mergeResult ? (
        <div className="workspace-main" style={{ padding: '0', paddingBottom: 0, background: 'transparent' }}>
          <div className="compression-settings" style={{ textAlign: 'center', padding: '3rem 2rem', alignItems: 'center' }}>
            <CheckCircle2 size={56} color="#22c55e" />
            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
              Merged {mergeResult.fileCount} PDFs into one document!
            </h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Your merged PDF is ready to download.</p>
          </div>

          <div className="scanner-bottom-bar" style={{ marginTop: '20px' }}>
            <button className="bottom-select-btn" onClick={resetAll}>
              <UploadCloud size={18} /> Merge Another
            </button>
            <button
              className="primary-btn"
              onClick={handleDownload}
              style={{ padding: '12px 30px', fontSize: '1.1rem', background: '#16a34a', border: 'none', borderRadius: '30px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}
            >
              <DownloadCloud size={20} style={{ marginRight: '8px' }} /> Download Merged PDF
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className={`tool-drop-zone ${flashClass}`} onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={64} className="zone-icon" />
          <h2 className="zone-title">Select PDF files</h2>
          <p className="zone-subtitle">Choose multiple PDFs to merge them into one</p>
          <p className="zone-subtitle" style={{ fontSize: '0.85rem', opacity: 0.7 }}>Maximum file size: {MAX_PDF_SIZE_MB}MB per file</p>
          <button className="split-btn-main mt-4">CHOOSE FILES</button>
        </div>
      ) : (
        <div className="workspace-main" style={{ padding: '0', background: 'transparent', paddingBottom: '80px' }}>
          <div className="scanner-grid mt-4">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={`pdf-card ${draggedIndex === index ? 'dragging-placeholder' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnter={(e) => handleDragEnter(e, index)}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div
                  className="pdf-card-preview"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    if (item.imageUrl) setPreviewImage(item.imageUrl);
                  }}
                >
                  <div className="pdf-overlay-top">
                    <span className="pdf-file-size">{item.fileSizeStr}</span>
                    <div className="pdf-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="pdf-icon-btn delete" onClick={() => removeFile(item.id)} title="Remove">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.file.name} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff', padding: '10px' }} />
                  ) : (
                    <FileText size={64} color="rgba(255,255,255,0.2)" />
                  )}
                </div>
                <div className="pdf-card-footer">
                  <div className="pdf-file-name" title={item.file.name}>
                    {item.file.name}
                  </div>
                </div>
              </div>
            ))}

            <div className="add-more-card" onClick={() => fileInputRef.current?.click()}>
              <div className="add-more-circle">
                <Plus size={32} />
              </div>
              <span>Add PDF</span>
            </div>
          </div>

          <div className="scanner-bottom-bar">
            <button className="bottom-select-btn" onClick={() => fileInputRef.current?.click()}>
              <UploadCloud size={18} /> Select More
            </button>
            <button className="bottom-convert-btn" onClick={handleMerge} disabled={isProcessing || items.length < 2}>
              {isProcessing ? 'Merging...' : `Merge PDF (${items.length} file${items.length === 1 ? '' : 's'})`}
            </button>
          </div>
        </div>
      )}

      <input type="file" multiple accept=".pdf,application/pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
      <ProcessingOverlay isVisible={isProcessing} text="Merging PDFs..." />

      {previewImage && (
        <div
          className="edit-modal-overlay"
          onClick={() => setPreviewImage(null)}
          style={{ zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div className="edit-modal" style={{ background: 'transparent', boxShadow: 'none', border: 'none', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} alt="Preview" />
            <button
              className="pdf-icon-btn"
              style={{ position: 'absolute', top: '-15px', right: '-15px', background: 'white', color: 'black', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
              onClick={() => setPreviewImage(null)}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MergePdfZone;
