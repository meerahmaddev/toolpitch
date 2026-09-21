'use client';

import { useState, useEffect, useRef } from 'react';
import './ConverterSection.css';
import { UploadCloud, Link as LinkIcon, Cloud, FileText, ChevronRight, FileImage, Check } from 'lucide-react';
import FileStagingZone from '@/components/tools/FileStagingZone';
import { message } from '@/utils/message';
import { api } from '@/utils/apiClient';
import { useRouter } from 'next/navigation';
import useDrivePicker from 'react-google-drive-picker';
import { setSuccessFile } from '@/utils/successHandoff';

interface RecentFile {
  _id: string;
  originalName: string;
  mimetype?: string;
  createdAt: string;
  filename: string;
}

interface StagedFile extends File {
  isUrl?: boolean;
  url?: string;
}

const ConverterSection = () => {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [stagedFile, setStagedFile] = useState<StagedFile | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isCheckingUrl, setIsCheckingUrl] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [isDriveUploading, setIsDriveUploading] = useState(false);

  const [openPicker, driveAuthResult] = useDrivePicker();
  const driveTokenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (driveAuthResult?.access_token) {
      driveTokenRef.current = driveAuthResult.access_token;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('gdrive_token', driveAuthResult.access_token);
      }
    }
  }, [driveAuthResult]);

  const playClick = () => window.soundManager?.playClick();

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const data = await api.getMyFiles();
        if (data.files && data.files.length > 0) {
          setRecentFiles(data.files.slice(0, 3));
        }
      } catch {
        // User might not be logged in, just ignore and show empty state
      }
    };
    fetchRecent();
  }, []);

  useEffect(() => {
    const preventNative = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', preventNative);
    window.addEventListener('drop', preventNative);
    return () => {
      window.removeEventListener('dragover', preventNative);
      window.removeEventListener('drop', preventNative);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    if (!file) return;

    let limitMB = 50;
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
      const fileToProcess = (Array.isArray(files) ? files[0] : files) as StagedFile;

      const response = fileToProcess.isUrl
        ? await api.processFromUrl(fileToProcess.url!, dynamicToolId)
        : await api.processFile(fileToProcess, dynamicToolId);

      setIsUploading(false);
      setIsSuccess(true);

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

      setTimeout(() => {
        setIsSuccess(false);
        setStagedFile(null);
        setSuccessFile(response.file);
        router.push('/success');
      }, 1500);
    } catch (error) {
      setIsUploading(false);
      message.error({ content: (error instanceof Error && error.message) || 'Conversion failed. Please try again.', key: 'upload-main' });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlInput || !urlInput.trim()) {
      message.error('Please enter a valid URL.');
      return;
    }
    if (!urlInput.startsWith('http')) {
      message.error('URL must start with http:// or https://');
      return;
    }

    playClick();
    const trimmedUrl = urlInput.trim();
    let filename = trimmedUrl.split('/').pop()?.split('?')[0] || 'url_file';

    // Many pasted URLs don't end in a real extension (redirects, query strings,
    // CDN paths) - ask the server what the URL actually serves so the staging
    // step's format list matches the real file type instead of a generic guess.
    setIsCheckingUrl(true);
    try {
      const info = await api.getUrlInfo(trimmedUrl);
      if (info.extension) {
        const base = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename;
        filename = `${base}.${info.extension}`;
      }
    } catch {
      // Inspection failed - stage anyway with the URL-derived filename.
    } finally {
      setIsCheckingUrl(false);
    }

    const urlFile = { name: filename, size: 0, isUrl: true, url: trimmedUrl } as unknown as StagedFile;
    setStagedFile(urlFile);
    setUrlInput('');
  };

  const handleDriveUpload = () => {
    playClick();
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    const developerKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';

    if (!clientId || !developerKey) {
      message.error('Google Drive API credentials are not configured.');
      return;
    }

    openPicker({
      clientId,
      developerKey,
      viewId: 'DOCS',
      showUploadView: true,
      showUploadFolders: true,
      supportDrives: true,
      multiselect: false,
      callbackFunction: async (data) => {
        if (data.action === 'picked') {
          const file = data.docs[0];
          const token =
            driveTokenRef.current ||
            driveAuthResult?.access_token ||
            (typeof window !== 'undefined' ? sessionStorage.getItem('gdrive_token') : null);

          if (!token) {
            message.error({ content: 'Google authentication expired. Please try again.', key: 'drive-upload' });
            return;
          }

          try {
            setIsDriveUploading(true);
            message.loading({ content: 'Importing file from Google Drive...', key: 'drive-upload' });

            const { blob, filename: resolvedName, mimeType: resolvedMime } = await api.fetchDriveFileBlob(
              file.id,
              file.name,
              token,
              file.mimeType || ''
            );

            const driveFile = new File([blob], resolvedName, { type: resolvedMime || blob.type });

            setIsDriveUploading(false);
            message.success({ content: `"${resolvedName}" imported from Google Drive!`, key: 'drive-upload' });

            // Stage the file so the user can select conversion format and convert!
            processFile(driveFile);
          } catch (error) {
            setIsDriveUploading(false);
            message.error({
              content: (error instanceof Error && error.message) || 'Google Drive import failed.',
              key: 'drive-upload',
            });
          }
        }
      },
    });
  };

  return (
    <div id="converter-section" className="converter-section">
      <div className="converter-grid">
        {/* Left: Drag & Drop Zone */}
        <div
          className={`drag-drop-zone ${isDragging ? 'active-drag' : ''} ${stagedFile ? 'has-file' : ''}`}
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!isUploading && !isDriveUploading && !isCheckingUrl && !isSuccess && !stagedFile) {
              playClick();
              document.getElementById('converter-file-input')?.click();
            }
          }}
          style={{ cursor: stagedFile || isUploading || isDriveUploading || isCheckingUrl ? 'default' : 'pointer' }}
        >
          <input
            type="file"
            id="converter-file-input"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                processFile(e.target.files[0]);
              }
              e.target.value = '';
            }}
          />

          {isSuccess ? (
            <>
              <div className="upload-icon-circle" style={{ background: '#10b981', color: 'white', border: 'none' }}>
                <Check size={32} />
              </div>
              <h2 className="drag-title">Conversion Successful!</h2>
              <p className="drag-subtitle">Redirecting to download...</p>
            </>
          ) : isUploading ? (
            <>
              <div className="converter-spinner"></div>
              <h2 className="drag-title">Processing & Converting...</h2>
              <p className="drag-subtitle">Please wait, your document is being converted...</p>
            </>
          ) : isDriveUploading ? (
            <>
              <div className="converter-spinner"></div>
              <h2 className="drag-title">Importing from Google Drive...</h2>
              <p className="drag-subtitle">Fetching file from your cloud storage...</p>
            </>
          ) : isCheckingUrl ? (
            <>
              <div className="converter-spinner"></div>
              <h2 className="drag-title">Loading File from URL...</h2>
              <p className="drag-subtitle">Connecting and verifying link...</p>
            </>
          ) : stagedFile ? (
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
              <FileStagingZone files={[stagedFile]} onConvert={handleConvertStaged} onCancel={() => setStagedFile(null)} />
            </div>
          ) : (
            <>
              <div className="upload-icon-circle">
                <UploadCloud size={32} color="var(--color-3)" />
              </div>
              <h2 className="drag-title">Drop your files here</h2>
              <p className="drag-subtitle">Secure, fast, and private file conversion</p>
              <button
                className="btn-select-files"
                onClick={(e) => {
                  e.stopPropagation();
                  playClick();
                  document.getElementById('converter-file-input')?.click();
                }}
              >
                Browse Files
              </button>
            </>
          )}
        </div>

        {/* Right: Alternative Imports & Formats */}
        <div className="converter-options">
          <div className="option-card">
            <h3 className="option-title">
              <Cloud size={18} /> Import from Cloud
            </h3>
            <div className="cloud-buttons" style={{ display: 'flex', width: '100%' }}>
              <button className="cloud-btn" style={{ flex: 1, position: 'relative' }} onClick={handleDriveUpload} disabled={isDriveUploading}>
                {isDriveUploading ? 'Downloading...' : 'Google Drive'}
              </button>
            </div>
          </div>

          <div className="option-card">
            <h3 className="option-title">
              <LinkIcon size={18} /> Paste URL
            </h3>
            <div className="url-input-wrapper">
              <input
                type="text"
                className="url-input"
                placeholder="https://example.com/file.pdf"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={isCheckingUrl}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUrlSubmit();
                }}
              />
              <button className="btn-url-submit" onClick={handleUrlSubmit} disabled={isCheckingUrl}>
                {isCheckingUrl ? (
                  <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', margin: 0, borderColor: 'rgba(255,255,255,0.3)', borderLeftColor: 'white' }}></div>
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
            </div>
          </div>

          <div className="option-card">
            <h3 className="option-title">
              <FileText size={18} /> Supported Formats
            </h3>
            <div className="format-badges scrollable">
              <span className="format-badge">PDF</span>
              <span className="format-badge">DOCX</span>
              <span className="format-badge">XLSX</span>
              <span className="format-badge">PPTX</span>
              <span className="format-badge">JPG</span>
              <span className="format-badge">PNG</span>
              <span className="format-badge">WEBP</span>
              <span className="format-badge">TXT</span>
              <span className="format-badge">MP3</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Recent Conversions */}
      <div className="recent-conversions-panel">
        <div className="recent-header">
          <h3>Recent Conversions</h3>
          <button
            className="view-workspace-btn"
            onClick={() => {
              playClick();
              router.push('/workspace');
            }}
          >
            View Workspace <ChevronRight size={14} />
          </button>
        </div>

        <div className="recent-list">
          {recentFiles.length > 0 ? (
            recentFiles.map((file) => {
              const isImage = file.mimetype?.includes('image');
              const ext = file.originalName.split('.').pop()?.toUpperCase();

              const timeAgo = (dateStr: string) => {
                const diff = Date.now() - new Date(dateStr).getTime();
                const mins = Math.floor(diff / 60000);
                if (mins < 1) return 'Just now';
                if (mins < 60) return `${mins} mins ago`;
                const hrs = Math.floor(mins / 60);
                if (hrs < 24) return `${hrs} hrs ago`;
                return `${Math.floor(hrs / 24)} days ago`;
              };

              return (
                <div
                  className="recent-item"
                  key={file._id}
                  onClick={() => {
                    playClick();
                    router.push('/workspace');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div
                    className="recent-icon"
                    style={{
                      background: isImage ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: isImage ? '#10b981' : '#ef4444',
                    }}
                  >
                    {isImage ? <FileImage size={18} /> : <FileText size={18} />}
                  </div>
                  <div className="recent-info">
                    <span className="recent-name">{file.originalName}</span>
                    <span className="recent-meta">
                      Converted to {ext} • {timeAgo(file.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
              No recent conversions found. Log in and convert a file to see it here!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConverterSection;
