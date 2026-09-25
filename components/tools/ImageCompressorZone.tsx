'use client';

import { useState, useRef } from 'react';
import { Upload, Download, ImageIcon, ArrowRight } from 'lucide-react';
import { message } from '@/utils/message';
import { api } from '@/utils/apiClient';
import { FILE_SIZE_LIMITS_MB, FILE_SIZE_LIMIT_BYTES } from '@/utils/fileLimits';
import { useRejectFlash } from '@/utils/useRejectFlash';
import ProcessingOverlay from './ProcessingOverlay';
import { useDownloadGuard } from '@/hooks/useDownloadGuard';
import './CompressPdfZone.css';
import './ImageCompressorZone.css';

// Matches the 5MB image cap enforced server-side (assertFileSizeAllowed in
// lib/converter/validation.ts, checked again in app/api/converter/edit-image/route.ts).
const MAX_IMAGE_SIZE_MB = FILE_SIZE_LIMITS_MB.image;
const MAX_IMAGE_SIZE_BYTES = FILE_SIZE_LIMIT_BYTES.image;

type OutputFormat = 'original' | 'jpeg' | 'png' | 'webp';

interface CompressStats {
  beforeSize: number;
  afterSize: number;
  blob: Blob;
  filename: string;
  previewUrl: string;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(2) + ' KB';
  return (kb / 1024).toFixed(2) + ' MB';
};

// Browsers can't decode HEIC/HEIF in an <img> tag (no built-in codec), so a
// thumbnail attempt always fails - detect it upfront and show a placeholder
// instead of a broken-image icon. Compression itself still works server-side.
const isHeicFile = (file: File) => /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';

// Sharp reads only the first frame of a GIF unless explicitly told to read all
// of them, and this build can't re-encode a multi-frame GIF back out either -
// so "compressing" an animated GIF would silently flatten it to a single
// static frame. Reject it upfront rather than quietly losing the animation.
const isGifFile = (file: File) => /\.gif$/i.test(file.name) || file.type === 'image/gif';

const THUMBNAIL_SIZE = 144;

// Full-resolution desktop photos can be tens of megapixels; decoding them
// straight into a 72px <img> stalls the main thread. Downscale first.
const createThumbnailUrl = async (source: Blob): Promise<string> => {
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return URL.createObjectURL(source);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const thumbBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    return thumbBlob ? URL.createObjectURL(thumbBlob) : URL.createObjectURL(source);
  } catch {
    return URL.createObjectURL(source);
  }
};

const ImageCompressorZone = () => {
  const { requireAuthToDownload } = useDownloadGuard();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState(70);
  const [format, setFormat] = useState<OutputFormat>('original');
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<CompressStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { flashClass, triggerReject } = useRejectFlash();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    e.target.value = '';
    if (!selectedFile) return;

    if (isGifFile(selectedFile)) {
      message.error("GIF images aren't supported for compression yet - animation would be lost. Please use JPG, PNG, WebP, or HEIC instead.");
      triggerReject();
      return;
    }

    if (selectedFile.size > MAX_IMAGE_SIZE_BYTES) {
      message.error(`File "${selectedFile.name}" is too large! Maximum ${MAX_IMAGE_SIZE_MB}MB allowed.`);
      triggerReject();
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selectedFile);
    setStats(null);
    setPreviewUrl(await createThumbnailUrl(selectedFile));
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setStats(null);
  };

  const handleCompress = async () => {
    if (!file) return;
    setIsProcessing(true);

    try {
      const { blob, filename } = await api.editImage(file, { quality, format });
      setStats({
        beforeSize: file.size,
        afterSize: blob.size,
        blob,
        filename,
        previewUrl: await createThumbnailUrl(blob),
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to compress image');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!stats || !file) return;
    requireAuthToDownload(() => {
      const url = URL.createObjectURL(stats.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = stats.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const savingsPercent = stats ? Math.round((1 - stats.afterSize / stats.beforeSize) * 100) : 0;

  if (!file) {
    return (
      <div className="compress-pdf-container fade-in">
        <div className={`tool-drop-zone ${flashClass}`} onClick={() => fileInputRef.current?.click()}>
          <ImageIcon size={64} className="zone-icon" />
          <h2 className="zone-title">Compress an Image</h2>
          <p className="zone-subtitle">Shrink JPG, PNG or WebP file size while keeping good visual quality</p>
          <p className="zone-subtitle" style={{ fontSize: '0.85rem', opacity: 0.7 }}>Maximum file size: {MAX_IMAGE_SIZE_MB}MB</p>
          <button className="split-btn-main mt-4">SELECT IMAGE</button>
        </div>
        <input type="file" accept="image/*,.heic,.heif" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />
      </div>
    );
  }

  return (
    <div className="compress-pdf-container fade-in">
      <div>
        <div className="compression-settings">
          <div className="compressor-preview-row">
            {!stats && isHeicFile(file) ? (
              <div className="compressor-preview-image compressor-heic-placeholder" style={{ width: 72, height: 72 }}>
                <ImageIcon size={28} />
              </div>
            ) : (
              <img
                src={stats ? stats.previewUrl : previewUrl || undefined}
                alt="Preview"
                className="compressor-preview-image"
                width={72}
                height={72}
                decoding="async"
              />
            )}
            <div className="compressor-file-info">
              <h3 className="compressor-file-name">{file.name}</h3>
              <p className="compressor-file-size">Original Size: {formatSize(file.size)}</p>
            </div>
          </div>

          <div className="compressor-field">
            <label>Compression Quality: {quality}%</label>
            <input
              type="range"
              min="1"
              max="100"
              value={quality}
              onChange={(e) => {
                setQuality(parseInt(e.target.value, 10));
                setStats(null);
              }}
              className="compressor-range"
            />
            <p className="compressor-hint">Lower quality = smaller file. 60-80% is usually the sweet spot.</p>
          </div>

          <div className="level-options">
            {(['webp', 'jpeg', 'png', 'original'] as const).map((f) => (
              <div
                key={f}
                className={`level-card ${format === f ? 'active' : ''}`}
                onClick={() => {
                  setFormat(f);
                  setStats(null);
                }}
              >
                <div className="level-title">{f === 'original' ? 'Keep Original' : f.toUpperCase()}</div>
                <div className="level-desc">
                  {f === 'original' &&
                    (isHeicFile(file) ? "HEIC isn't supported as an output - converts to JPG instead" : 'Keeps the current file format')}
                  {f === 'jpeg' && 'Smallest size, no transparency'}
                  {f === 'png' && 'Lossless, supports transparency'}
                  {f === 'webp' && 'Modern format, great compression'}
                </div>
              </div>
            ))}
          </div>

          {stats && (
            <div className="compression-stats fade-in">
              <div className="stat-box">
                <span className="stat-label">Original</span>
                <span className="stat-value strike">{formatSize(stats.beforeSize)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <ArrowRight size={24} color="#15803d" />
                <span className="savings-badge">{savingsPercent > 0 ? `Saved ${savingsPercent}%` : 'No size reduction'}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Compressed</span>
                <span className="stat-value">{formatSize(stats.afterSize)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="scanner-bottom-bar" style={{ marginTop: '20px' }}>
          {!stats ? (
            <>
              <button className="bottom-select-btn" onClick={reset}>
                <Upload size={18} /> Choose Another
              </button>
              <button className="bottom-convert-btn" onClick={handleCompress} disabled={isProcessing}>
                {isProcessing ? 'Compressing...' : 'Compress Image'}
              </button>
            </>
          ) : (
            <>
              <button className="bottom-select-btn" onClick={reset}>
                <Upload size={18} /> Compress Another
              </button>
              <button className="bottom-download-btn" onClick={handleDownload}>
                <Download size={20} /> Download Compressed Image
              </button>
            </>
          )}
        </div>
      </div>

      <input type="file" accept="image/*,.heic,.heif" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />
      <ProcessingOverlay isVisible={isProcessing} text="Compressing Image..." />
    </div>
  );
};

export default ImageCompressorZone;
