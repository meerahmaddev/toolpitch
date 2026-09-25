'use client';

import { useState, useRef } from 'react';
import { UploadCloud, FileText, DownloadCloud, ArrowRight } from 'lucide-react';
import { message } from '@/utils/message';
import { api } from '@/utils/apiClient';
import { FILE_SIZE_LIMITS_MB, FILE_SIZE_LIMIT_BYTES } from '@/utils/fileLimits';
import { useRejectFlash } from '@/utils/useRejectFlash';
import ProcessingOverlay from './ProcessingOverlay';
import { useDownloadGuard } from '@/hooks/useDownloadGuard';
import './CompressPdfZone.css';
import './ImageCompressorZone.css'; // Shared file name row styles
import './ImagesToPdfZone.css'; // Reuse scanner grid styles

// Matches the 10MB PDF cap enforced server-side (assertFileSizeAllowed in
// lib/converter/validation.ts, and again in python_service/main.py). Checked here too so an
// oversized file is rejected immediately on selection instead of after the user picks a
// compression level, clicks Compress, and waits for the round trip to fail.
const MAX_PDF_SIZE_MB = FILE_SIZE_LIMITS_MB.pdf;
const MAX_PDF_SIZE_BYTES = FILE_SIZE_LIMIT_BYTES.pdf;

interface CompressStats {
  beforeSize: string;
  afterSize: string;
  savingsPercent: number;
  blob: Blob;
}

const CompressPdfZone = () => {
  const { requireAuthToDownload } = useDownloadGuard();
  const [file, setFile] = useState<File | null>(null);
  const [fileSizeStr, setFileSizeStr] = useState('');
  const [compressionLevel, setCompressionLevel] = useState<'low' | 'recommended' | 'extreme'>('recommended');
  const [isCompressing, setIsCompressing] = useState(false);
  const [stats, setStats] = useState<CompressStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { flashClass, triggerReject } = useRejectFlash();

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(2) + ' KB';
    const mb = kb / 1024;
    return mb.toFixed(2) + ' MB';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      message.error('Please select a PDF file.');
      triggerReject();
      e.target.value = '';
      return;
    }

    if (selectedFile.size > MAX_PDF_SIZE_BYTES) {
      message.error(`File "${selectedFile.name}" is too large! Maximum ${MAX_PDF_SIZE_MB}MB allowed.`);
      triggerReject();
      e.target.value = '';
      return;
    }

    setFile(selectedFile);
    setFileSizeStr(formatSize(selectedFile.size));
    setStats(null);
    e.target.value = '';
  };

  const handleCompress = async () => {
    if (!file) return;

    setIsCompressing(true);
    message.loading({ content: 'Compressing PDF...', key: 'compress-pdf' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('level', compressionLevel);

      const response = await api.compressPdf(formData);

      setStats({
        beforeSize: formatSize(response.beforeSize),
        afterSize: formatSize(response.afterSize),
        savingsPercent: Math.round((1 - response.afterSize / response.beforeSize) * 100),
        blob: response.data,
      });

      message.success({ content: 'PDF compressed successfully!', key: 'compress-pdf' });
    } catch (error) {
      message.error({ content: (error instanceof Error && error.message) || 'Compression failed', key: 'compress-pdf' });
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!stats || !file) return;

    requireAuthToDownload(() => {
      const url = window.URL.createObjectURL(stats.blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Compressed_${file.name}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.success('Download complete!');
    });
  };

  const playClick = () => window.soundManager?.playClick();

  return (
    <>
      {!file ? (
        <div
          className={`tool-drop-zone ${flashClass}`}
          onClick={() => {
            playClick();
            fileInputRef.current?.click();
          }}
        >
          <UploadCloud size={64} className="zone-icon" />
          <h2 className="zone-title">Compress PDF file</h2>
          <p className="zone-subtitle">Reduce file size while optimizing for maximal PDF quality</p>
          <p className="zone-subtitle" style={{ fontSize: '0.85rem', opacity: 0.7 }}>Maximum file size: {MAX_PDF_SIZE_MB}MB</p>
          <button
            className="split-btn-main mt-4"
            onClick={(e) => {
              e.stopPropagation();
              playClick();
              fileInputRef.current?.click();
            }}
          >
            <UploadCloud size={18} color="#ffffff" style={{ minWidth: '18px' }} /> SELECT PDF FILE
          </button>
        </div>
      ) : (
        <div className="compress-pdf-container fade-in">
          <div className="workspace-main" style={{ padding: '0', background: 'transparent' }}>
          <div className="compression-settings">
            <div className="compressor-preview-row">
              <div style={{ background: 'var(--color-1)', padding: '15px', borderRadius: '8px', flexShrink: 0 }}>
                <FileText size={32} color="white" />
              </div>
              <div className="compressor-file-info">
                <h3 className="compressor-file-name">{file.name}</h3>
                <p className="compressor-file-size">Original Size: {fileSizeStr}</p>
              </div>
            </div>

            <div className="level-options">
              <div
                className={`level-card ${compressionLevel === 'low' ? 'active' : ''}`}
                onClick={() => {
                  setCompressionLevel('low');
                  setStats(null);
                }}
              >
                <div className="level-title">Less Compression</div>
                <div className="level-desc">High quality, less compression</div>
              </div>
              <div
                className={`level-card ${compressionLevel === 'recommended' ? 'active' : ''}`}
                onClick={() => {
                  setCompressionLevel('recommended');
                  setStats(null);
                }}
              >
                <div className="level-title">Recommended Compression</div>
                <div className="level-desc">Good quality, good compression</div>
              </div>
              <div
                className={`level-card ${compressionLevel === 'extreme' ? 'active' : ''}`}
                onClick={() => {
                  setCompressionLevel('extreme');
                  setStats(null);
                }}
              >
                <div className="level-title">Extreme Compression</div>
                <div className="level-desc">Less quality, high compression</div>
              </div>
            </div>

            {stats && (
              <div className="compression-stats fade-in">
                <div className="stat-box">
                  <span className="stat-label">Original</span>
                  <span className="stat-value strike">{stats.beforeSize}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <ArrowRight size={24} color="#15803d" />
                  <span className="savings-badge">
                    {stats.savingsPercent > 0 ? `Saved ${stats.savingsPercent}%` : 'Already optimized'}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Compressed</span>
                  <span className="stat-value">{stats.afterSize}</span>
                </div>
              </div>
            )}
          </div>

          <div className="scanner-bottom-bar" style={{ marginTop: '20px' }}>
            {!stats ? (
              <>
                <button className="bottom-select-btn" onClick={() => setFile(null)}>
                  <UploadCloud size={18} /> Choose Another
                </button>
                <button className="bottom-convert-btn" onClick={handleCompress} disabled={isCompressing}>
                  {isCompressing ? 'Compressing...' : 'Compress PDF'}
                </button>
              </>
            ) : (
              <>
                <button
                  className="bottom-select-btn"
                  onClick={() => {
                    setFile(null);
                    setStats(null);
                  }}
                >
                  <UploadCloud size={18} /> Compress Another
                </button>
                <button className="bottom-download-btn" onClick={handleDownload}>
                  <DownloadCloud size={20} /> Download Compressed PDF
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )}

    <input type="file" accept=".pdf,application/pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
      <ProcessingOverlay isVisible={isCompressing} text="Compressing PDF..." />
    </>
  );
};

export default CompressPdfZone;
