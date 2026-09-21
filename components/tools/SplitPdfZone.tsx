'use client';

import { useState, useRef, useEffect } from 'react';
import { UploadCloud, Scissors, ArrowRight, RefreshCw, DownloadCloud, CheckCircle2 } from 'lucide-react';
import { message } from '@/utils/message';
import { api } from '@/utils/apiClient';
import { FILE_SIZE_LIMITS_MB, FILE_SIZE_LIMIT_BYTES } from '@/utils/fileLimits';
import { useRejectFlash } from '@/utils/useRejectFlash';
import ProcessingOverlay from './ProcessingOverlay';
import { useDownloadGuard } from '@/hooks/useDownloadGuard';
import './SplitPdfZone.css';
import './ImagesToPdfZone.css'; // For basic layout
import './CompressPdfZone.css'; // Reuse the .compression-settings results-card style

interface PdfPage {
  pageNumber: number;
  imageUrl: string;
}

interface SplitResult {
  blob: Blob;
  fileCount: number;
}

// Matches the 10MB PDF cap enforced server-side (assertFileSizeAllowed in
// lib/converter/validation.ts). Checked here too so an oversized file is rejected
// immediately on selection instead of after the browser spends time rendering every
// page as a thumbnail, only for the round trip to fail once Split is clicked.
const MAX_PDF_SIZE_MB = FILE_SIZE_LIMITS_MB.pdf;
const MAX_PDF_SIZE_BYTES = FILE_SIZE_LIMIT_BYTES.pdf;

const SplitPdfZone = () => {
  const { requireAuthToDownload } = useDownloadGuard();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [splitEveryN, setSplitEveryN] = useState(1);
  const [autoSplitEnabled, setAutoSplitEnabled] = useState(false);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const { flashClass, triggerReject } = useRejectFlash();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(2) + ' KB';
    const mb = kb / 1024;
    return mb.toFixed(2) + ' MB';
  };

  const loadPdfPages = async (file: File) => {
    setIsLoading(true);
    message.loading({ content: 'Loading PDF pages...', key: 'load-pdf' });

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const numPages = pdf.numPages;
      const loadedPages: PdfPage[] = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, canvas, viewport }).promise;

        loadedPages.push({ pageNumber: i, imageUrl: canvas.toDataURL('image/jpeg', 0.8) });
      }

      setPages(loadedPages);
      message.success({ content: `Loaded ${numPages} pages.`, key: 'load-pdf' });
    } catch (error) {
      console.error(error);
      message.error({ content: 'Failed to read PDF file.', key: 'load-pdf' });
      setPdfFile(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      message.error('Please select a valid PDF file.');
      triggerReject();
      e.target.value = '';
      return;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      message.error(`File "${file.name}" is too large! Maximum ${MAX_PDF_SIZE_MB}MB allowed.`);
      triggerReject();
      e.target.value = '';
      return;
    }

    setPdfFile(file);
    setSplitPoints([]);
    setAutoSplitEnabled(false);
    setSplitResult(null);
    await loadPdfPages(file);
    e.target.value = '';
  };

  const toggleSplitPoint = (index: number) => {
    setSplitPoints((prev) => (prev.includes(index) ? prev.filter((p) => p !== index) : [...prev, index].sort((a, b) => a - b)));
    setAutoSplitEnabled(false);
  };

  useEffect(() => {
    if (autoSplitEnabled && pages.length > 0 && splitEveryN > 0) {
      const newSplits: number[] = [];
      for (let i = splitEveryN; i < pages.length; i += splitEveryN) {
        newSplits.push(i);
      }
      setSplitPoints(newSplits);
    }
  }, [autoSplitEnabled, splitEveryN, pages.length]);

  const handleSplitPdf = async () => {
    if (!pdfFile) return;

    setIsProcessing(true);
    message.loading({ content: 'Splitting PDF...', key: 'split-pdf' });

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('splitPoints', JSON.stringify(splitPoints));
      formData.append('toolId', 'split-pdf');

      const response = await api.splitPdf(formData);

      setSplitResult({ blob: response.data, fileCount: splitPoints.length + 1 });
      message.success({ content: 'PDF split successfully!', key: 'split-pdf' });
    } catch (error) {
      message.error({ content: (error instanceof Error && error.message) || 'Failed to split PDF', key: 'split-pdf' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!splitResult) return;

    requireAuthToDownload(() => {
      const url = window.URL.createObjectURL(splitResult.blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Split_PDF_${Date.now()}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.success('Download complete!');
    });
  };

  const resetAll = () => {
    setPdfFile(null);
    setPages([]);
    setSplitPoints([]);
    setSplitResult(null);
    setAutoSplitEnabled(false);
  };

  const resultingPdfsCount = splitPoints.length + 1;

  return (
    <div className="split-pdf-container fade-in">
      {splitResult ? (
        <div className="workspace-main" style={{ padding: '0', paddingBottom: 0, background: 'transparent' }}>
          <div className="compression-settings" style={{ textAlign: 'center', padding: '3rem 2rem', alignItems: 'center' }}>
            <CheckCircle2 size={56} color="#22c55e" />
            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
              Split into {splitResult.fileCount} PDF{splitResult.fileCount === 1 ? '' : 's'}!
            </h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Your split PDFs are ready to download as a ZIP.</p>
          </div>

          <div className="scanner-bottom-bar" style={{ marginTop: '20px' }}>
            <button className="bottom-select-btn" onClick={resetAll}>
              <UploadCloud size={18} /> Split Another
            </button>
            <button
              className="primary-btn"
              onClick={handleDownload}
              style={{ padding: '12px 30px', fontSize: '1.1rem', background: '#16a34a', border: 'none', borderRadius: '30px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}
            >
              <DownloadCloud size={20} style={{ marginRight: '8px' }} /> Download ZIP
            </button>
          </div>
        </div>
      ) : !pdfFile ? (
        <div className={`tool-drop-zone ${flashClass}`} onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={64} className="zone-icon" />
          <h2 className="zone-title">Select PDF file to split</h2>
          <p className="zone-subtitle">Extract pages or split into multiple documents</p>
          <p className="zone-subtitle" style={{ fontSize: '0.85rem', opacity: 0.7 }}>Maximum file size: {MAX_PDF_SIZE_MB}MB</p>
          <button className="split-btn-main mt-4">CHOOSE FILE</button>
        </div>
      ) : (
        <div className="workspace-main" style={{ padding: '0', background: 'transparent' }}>
          <div className="pdf-info-header">
            <h3>{pdfFile.name}</h3>
            <p>
              {pages.length} pages • {formatSize(pdfFile.size)}
            </p>
          </div>

          <div className="split-toolbar">
            <div className="split-toolbar-left">
              <label className="split-mode-label">
                <input type="checkbox" checked={autoSplitEnabled} onChange={(e) => setAutoSplitEnabled(e.target.checked)} />
                Split after every
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="custom-number-input">
                  <button
                    className="num-btn"
                    onClick={() => {
                      setSplitEveryN(Math.max(1, splitEveryN - 1));
                      setAutoSplitEnabled(true);
                    }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    className="split-number-input"
                    min="1"
                    max={pages.length - 1 || 1}
                    value={splitEveryN}
                    onChange={(e) => {
                      setSplitEveryN(parseInt(e.target.value) || 1);
                      setAutoSplitEnabled(true);
                    }}
                  />
                  <button
                    className="num-btn"
                    onClick={() => {
                      setSplitEveryN(Math.min(pages.length - 1 || 1, splitEveryN + 1));
                      setAutoSplitEnabled(true);
                    }}
                  >
                    +
                  </button>
                </div>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>pages</span>
              </div>
            </div>

            <button className="primary-btn" style={{ padding: '8px 24px', fontSize: '1rem', background: '#2563eb' }} onClick={handleSplitPdf} disabled={isProcessing || isLoading}>
              {isProcessing ? 'Processing...' : `Split (${resultingPdfsCount} PDFs)`} <ArrowRight size={18} style={{ marginLeft: '8px' }} />
            </button>
          </div>

          {isLoading ? (
            <div className="split-pages-viewer" style={{ justifyContent: 'center' }}>
              <RefreshCw size={32} className="spin" style={{ color: '#60a5fa' }} />
            </div>
          ) : (
            <div className="split-pages-viewer custom-scrollbar">
              {pages.map((page, index) => {
                const isLastPage = index === pages.length - 1;
                const nextPageIndex = index + 1;
                const isSplitActive = splitPoints.includes(nextPageIndex);

                return (
                  <div key={`page-wrapper-${page.pageNumber}`} className="split-page-wrapper">
                    <div className="split-page-card">
                      <div className="split-page-image-container">
                        <img src={page.imageUrl} alt={`Page ${page.pageNumber}`} className="split-page-image" />
                      </div>
                      <div className="split-page-footer">
                        Document_{pdfFile.name.substring(0, 5)}...
                        <br />
                        {page.pageNumber}
                      </div>
                    </div>

                    {!isLastPage && (
                      <div
                        className={`split-divider ${isSplitActive ? 'active' : ''}`}
                        onClick={() => toggleSplitPoint(nextPageIndex)}
                        title={`Split between page ${page.pageNumber} and ${page.pageNumber + 1}`}
                      >
                        <div className="split-divider-line"></div>
                        <div className="split-scissors-icon">
                          <Scissors size={18} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', paddingBottom: '20px' }}>
            <button className="choose-diff-btn" onClick={resetAll}>
              <UploadCloud size={16} /> Choose Different File
            </button>
          </div>
        </div>
      )}

      <input type="file" accept=".pdf,application/pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
      <ProcessingOverlay isVisible={isProcessing} text="Splitting PDF..." />
    </div>
  );
};

export default SplitPdfZone;
