'use client';

import { useState, useRef, useEffect } from 'react';
import './UploadModal.css';
import { UploadCloud, X, Check } from 'lucide-react';
import { message } from '@/utils/message';
import { api } from '@/utils/apiClient';
import FileStagingZone from './FileStagingZone';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (response: { file: Record<string, unknown>; method?: string }) => void;
}

const UploadModal = ({ isOpen, onClose, onSuccess }: UploadModalProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const preventNative = (e: DragEvent) => e.preventDefault();

    if (isOpen) {
      window.addEventListener('dragover', preventNative);
      window.addEventListener('drop', preventNative);
    }

    return () => {
      window.removeEventListener('dragover', preventNative);
      window.removeEventListener('drop', preventNative);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsDragging(false);
      setIsUploading(false);
      setIsSuccess(false);
      setStagedFile(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = (file: File) => {
    if (!file) return;

    let limitMB = 20;
    if (file.type === 'application/pdf') limitMB = 10;
    else if (file.type.startsWith('image/')) limitMB = 5;
    else if (file.type.startsWith('audio/')) limitMB = 5;

    if (file.size > limitMB * 1024 * 1024) {
      message.error(`File is too large! Maximum ${limitMB}MB allowed for this file type.`);
      return;
    }

    setStagedFile(file);
  };

  const handleConvertStaged = async (files: File[] | File, dynamicToolId: string) => {
    try {
      setIsUploading(true);
      const fileToProcess = Array.isArray(files) ? files[0] : files;

      const response = await api.processFile(fileToProcess, dynamicToolId);

      setIsUploading(false);

      if (response.method === 'layout-mode' || response.method === 'layout-mode-corrected') {
        message.success({ content: 'Converted successfully using Standard Layout mode!', key: 'upload-main' });
      } else if (response.method === 'image-fallback') {
        message.warning({
          content: 'This PDF has no selectable text (it may be scanned or use outlined/flattened fonts), so each page was kept as an image. The Word file is not editable — use an OCR tool first if you need editable text.',
          key: 'upload-main',
          duration: 6,
        });
      } else if (response.method) {
        message.warning({
          content: 'Converted using Advanced Text Recovery mode — the original PDF\'s tables, images, and layout may not carry over exactly.',
          key: 'upload-main',
          duration: 5,
        });
      }

      setIsSuccess(true);

      setTimeout(() => {
        onSuccess(response);
        onClose();
      }, 2000);
    } catch (error) {
      setIsUploading(false);
      message.error((error instanceof Error && error.message) || 'Upload failed');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
    e.target.value = '';
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="upload-modal-overlay" onClick={onClose}>
      <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
        {!isSuccess && !isUploading && (
          <button className="upload-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        )}

        {isSuccess ? (
          <div className="success-zone">
            <div className="success-icon-container">
              <Check size={40} strokeWidth={3} />
            </div>
            <h2 className="success-title">Upload Successful!</h2>
            <p className="success-subtitle">Your file has been safely saved.</p>
          </div>
        ) : isUploading ? (
          <div className="uploading-zone">
            <div className="spinner"></div>
            <h2 className="success-title">Uploading...</h2>
            <p className="success-subtitle">Please wait while we secure your file.</p>
          </div>
        ) : (
          <>
            <h2 className="upload-modal-title">Upload File</h2>
            <p className="upload-modal-subtitle">Add a new file to your workspace for conversion.</p>

            <div
              className={`drop-zone ${isDragging ? 'active' : ''} ${stagedFile ? 'has-file' : ''}`}
              onDragEnter={handleDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={!stagedFile ? handleBrowseClick : undefined}
            >
              {stagedFile ? (
                <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', cursor: 'default' }}>
                  <FileStagingZone files={[stagedFile]} onConvert={handleConvertStaged} onCancel={() => setStagedFile(null)} />
                </div>
              ) : (
                <>
                  <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
                  <UploadCloud size={48} className="drop-icon" strokeWidth={1.5} />
                  <h3 className="drop-text">Drag & drop your file here</h3>
                  <p className="drop-hint">Files supported: PDF, DOCX, JPG, PNG, MP4 (Max 50MB)</p>

                  <button
                    className="browse-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBrowseClick();
                    }}
                  >
                    Browse Files
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UploadModal;
