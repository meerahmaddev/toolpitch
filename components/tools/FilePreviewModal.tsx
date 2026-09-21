'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Music, FileQuestion } from 'lucide-react';
import './FilePreviewModal.css';
import type { FileCardData } from './FileCard';
import { api, authHeader } from '@/utils/apiClient';
import { message } from '@/utils/message';
import { useDownloadGuard } from '@/hooks/useDownloadGuard';

interface FilePreviewModalProps {
  file: FileCardData | null;
  onClose: () => void;
}

const FilePreviewModal = ({ file, onClose }: FilePreviewModalProps) => {
  const { requireAuthToDownload } = useDownloadGuard();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // <img>/<audio>/<video>/<iframe> src can't carry an Authorization header, and
  // this route requires one for non-guest files (same issue fixed for Workspace
  // thumbnails) — so fetch the bytes ourselves and hand the browser a blob URL.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setBlobUrl(null);
    setLoadFailed(false);

    if (file.isExpired) {
      setLoadFailed(true);
      return;
    }

    fetch(`/api/converter/download/${file.filename}?inline=true`, { headers: authHeader() })
      .then((res) => {
        if (!res.ok) throw new Error('Preview unavailable');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  if (!file) return null;

  const handleDownload = () => {
    if (file.isExpired) {
      message.error('This file has expired and is no longer available for download.');
      return;
    }
    requireAuthToDownload(async () => {
      try {
        await api.downloadFile(file.filename, file.name);
      } catch (error) {
        message.error((error instanceof Error && error.message) || 'Failed to download file');
      }
    });
  };

  const renderFallbackPreview = () => (
    <div className="preview-fallback-container">
      <FileQuestion size={80} className="preview-fallback-icon" />
      {file.isExpired ? (
        <>
          <h3>File Expired</h3>
          <p>This file was automatically deleted after 24 hours and is no longer available.</p>
        </>
      ) : (
        <>
          <h3>Download to View</h3>
          <p>This file type cannot be previewed in the browser. Please download it to view its contents.</p>
          <button className="preview-download-btn" onClick={handleDownload}>
            <Download size={18} />
            Download File
          </button>
        </>
      )}
    </div>
  );

  const renderPreviewContent = () => {
    if (!blobUrl) {
      if (loadFailed) return renderFallbackPreview();
      return (
        <div className="preview-media-container">
          <div className="preview-loader">Loading preview...</div>
        </div>
      );
    }

    if (!file.mimetype) {
      return renderFallbackPreview();
    }

    if (file.mimetype.startsWith('image/')) {
      return (
        <div className="preview-media-container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={blobUrl} alt={file.name} className="preview-image" onError={() => setLoadFailed(true)} />
        </div>
      );
    }

    if (file.mimetype.startsWith('audio/')) {
      return (
        <div className="preview-media-container audio-container">
          <Music size={64} className="preview-audio-icon" />
          <audio controls src={blobUrl} className="preview-audio">
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }

    if (file.mimetype.startsWith('video/')) {
      return (
        <div className="preview-media-container">
          <video controls src={blobUrl} className="preview-video">
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') {
      return (
        <div className="preview-iframe-container">
          <iframe src={blobUrl} title={file.name} className="preview-iframe" />
        </div>
      );
    }

    return renderFallbackPreview();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="preview-modal-backdrop" onClick={onClose}>
      <div className="preview-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <div className="preview-file-info">
            <h3 className="preview-title" title={file.name}>
              {file.name}
            </h3>
            <span className="preview-size">{file.size}</span>
          </div>
          <div className="preview-actions">
            <button className="preview-action-btn primary" onClick={handleDownload} title="Download">
              <Download size={18} />
            </button>
            <button className="preview-action-btn danger" onClick={onClose} title="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="preview-modal-body">{renderPreviewContent()}</div>
      </div>
    </div>,
    document.body
  );
};

export default FilePreviewModal;
