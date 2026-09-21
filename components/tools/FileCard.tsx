'use client';

import { useState, useEffect } from 'react';
import { Download, RefreshCw, Star, MoreVertical, Pin, RefreshCcw, Check, Eye } from 'lucide-react';
import ToolIcon from './ToolIcon';
import { message } from '@/utils/message';
import { api, authHeader } from '@/utils/apiClient';
import { useDownloadGuard } from '@/hooks/useDownloadGuard';

const OFFICE_THUMBNAIL_MIMETYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export interface FileCardData {
  id: string;
  name: string;
  filename: string;
  time: string;
  iconType: string;
  iconColor: string;
  size: string;
  status: string;
  isStarred: boolean;
  isPinned: boolean;
  isDeleted: boolean;
  isExpired: boolean;
  mimetype: string;
}

const RETENTION_MS = 24 * 60 * 60 * 1000;

function getFileExtension(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  if (dot === -1 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1).toUpperCase();
}

type ExpiryTone = 'safe' | 'urgent' | 'expired';

function getExpiryStatus(createdAt: Date, isExpired: boolean): { label: string; tone: ExpiryTone } {
  if (isExpired) return { label: 'Expired', tone: 'expired' };

  const remainingMs = createdAt.getTime() + RETENTION_MS - Date.now();
  if (remainingMs <= 0) return { label: 'Expiring soon', tone: 'urgent' };

  const remainingHours = remainingMs / (60 * 60 * 1000);
  if (remainingHours < 1) {
    const remainingMinutes = Math.max(1, Math.round(remainingMs / 60000));
    return { label: `Expires in ${remainingMinutes}m`, tone: 'urgent' };
  }
  if (remainingHours < 4) {
    return { label: `Expires in ${Math.round(remainingHours)}h`, tone: 'urgent' };
  }
  return { label: `Expires in ${Math.round(remainingHours)}h`, tone: 'safe' };
}

interface FileCardProps {
  data: FileCardData;
  viewMode: 'grid' | 'list';
  onContextMenu: (e: React.MouseEvent) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleState: (updates: Record<string, boolean>) => void;
  onPreview: () => void;
}

const FileCard = ({ data, viewMode, onContextMenu, isSelectionMode, isSelected, onSelect, onToggleState, onPreview }: FileCardProps) => {
  const { requireAuthToDownload } = useDownloadGuard();
  const { name, filename, time, iconType, iconColor, size, isStarred, isPinned, isDeleted, isExpired, mimetype } = data;
  const [isDownloading, setIsDownloading] = useState(false);
  const [thumbnailBlobUrl, setThumbnailBlobUrl] = useState<string | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const createdAt = new Date(time);
  const formattedTime = createdAt.toLocaleDateString() + ' ' + createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fileExtension = getFileExtension(name || filename);
  const expiryStatus = getExpiryStatus(createdAt, isExpired);

  const playClick = () => window.soundManager?.playClick();

  const thumbnailEndpoint = mimetype?.startsWith('image/')
    ? `/api/converter/download/${filename}?inline=true`
    : mimetype === 'application/pdf' || OFFICE_THUMBNAIL_MIMETYPES.has(mimetype)
      ? `/api/converter/thumbnail/${filename}`
      : null;

  const isSupportedPreview =
    !isExpired &&
    (mimetype?.startsWith('image/') ||
      mimetype?.startsWith('audio/') ||
      mimetype?.startsWith('video/') ||
      mimetype === 'application/pdf' ||
      mimetype === 'text/plain' ||
      OFFICE_THUMBNAIL_MIMETYPES.has(mimetype || ''));

  // Thumbnails need the Authorization header for non-guest files, and a plain
  // <img src> can't send custom headers — so fetch the bytes ourselves and
  // hand the browser an object URL instead.
  useEffect(() => {
    if (!thumbnailEndpoint) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setThumbnailBlobUrl(null);
    setThumbnailFailed(false);

    if (isExpired) return;

    fetch(thumbnailEndpoint, { headers: authHeader() })
      .then((res) => {
        if (!res.ok) throw new Error('Thumbnail unavailable');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbnailBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setThumbnailFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [thumbnailEndpoint, isExpired]);

  const renderIcon = () =>
    thumbnailBlobUrl && !thumbnailFailed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumbnailBlobUrl} alt="" className="file-thumbnail" onError={() => setThumbnailFailed(true)} />
    ) : (
      <ToolIcon type={iconType} color={`rgb(${iconColor})`} />
    );

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpired) {
      message.error('This file has expired and is no longer available for download.');
      return;
    }
    playClick();
    if (isDownloading) return;

    requireAuthToDownload(async () => {
      setIsDownloading(true);
      message.loading({ content: 'Downloading...', key: 'download' });
      try {
        await api.downloadFile(filename, name);
        message.success({ content: 'Download complete!', key: 'download' });
      } catch (error) {
        message.error({ content: (error instanceof Error && error.message) || 'Failed to download file', key: 'download' });
      } finally {
        setIsDownloading(false);
      }
    });
  };

  if (viewMode === 'list') {
    return (
      <div
        className={`file-list-row ${isSelected ? 'selected' : ''}`}
        onContextMenu={onContextMenu}
        onClick={isSelectionMode ? onSelect : handleDownload}
        style={{ cursor: 'pointer' }}
      >
        <div className="col-name">
          {isSelectionMode && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                marginRight: '12px',
                borderRadius: '50%',
                background: isSelected ? 'var(--color-3)' : 'transparent',
                border: isSelected ? 'none' : '2px solid rgba(0,0,0,0.2)',
                color: 'white',
              }}
            >
              {isSelected && <Check size={12} strokeWidth={4} />}
            </div>
          )}
          <div className="file-icon" style={{ background: `rgba(${iconColor}, 0.15)` }}>
            {renderIcon()}
          </div>
          <span className="file-name" title={name}>
            {isPinned && <Pin size={12} fill="var(--color-3)" color="var(--color-3)" style={{ marginRight: '4px' }} />}
            {isStarred && <Star size={12} fill="#eab308" color="#eab308" style={{ marginRight: '4px' }} />}
            {name}
          </span>
          {fileExtension && (
            <div className="format-badge" style={{ background: `rgba(${iconColor}, 0.12)`, color: `rgb(${iconColor})` }}>
              {fileExtension}
            </div>
          )}
          {expiryStatus.tone !== 'safe' && (
            <span className={`expired-badge expired-badge--${expiryStatus.tone}`}>{expiryStatus.label}</span>
          )}
        </div>
        <div className="col-date">{formattedTime}</div>
        <div className="col-size">{size}</div>
        <div className="col-actions">
          {!isSelectionMode && (
            <>
              {isDeleted ? (
                <>
                  <button
                    className="action-icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleState({ isDeleted: false });
                    }}
                    title="Restore"
                  >
                    <RefreshCcw size={16} />
                  </button>
                  <button
                    className="card-options-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onContextMenu(e);
                    }}
                  >
                    <MoreVertical size={18} />
                  </button>
                </>
              ) : (
                <>
                  {isDownloading && <RefreshCw size={16} className="spin" style={{ marginRight: '8px', color: 'rgba(26,11,46,0.5)' }} />}
                  <button
                    className="action-icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      playClick();
                      onPreview();
                    }}
                    title="Preview"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    className="card-options-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      playClick();
                      onContextMenu(e);
                    }}
                  >
                    <MoreVertical size={18} />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`file-card ${isSelected ? 'selected' : ''}`}
      onContextMenu={onContextMenu}
      onClick={isSelectionMode ? onSelect : handleDownload}
      style={{
        cursor: 'pointer',
        position: 'relative',
        border: isSelected ? '2px solid var(--color-3)' : '',
        backgroundColor: isSelected ? 'rgba(123, 49, 131, 0.03)' : '',
      }}
    >
      {isSelectionMode && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: isSelected ? 'var(--color-3)' : 'rgba(0,0,0,0.05)',
            border: isSelected ? 'none' : '2px solid rgba(0,0,0,0.15)',
            color: 'white',
            transition: 'all 0.2s ease',
          }}
        >
          {isSelected && <Check size={14} strokeWidth={4} />}
        </div>
      )}

      <div className="card-header">
        <div className="card-title-area">
          <div className="file-icon" style={{ background: `rgba(${iconColor}, 0.15)` }}>
            {renderIcon()}
          </div>
          <div className="file-info">
            <div className="file-name" title={name || 'Unknown'}>
              <span className="file-name-text">{name || 'Unnamed File'}</span>
            </div>
            <p className="file-time">
              {formattedTime} • {size}
            </p>
          </div>
        </div>
      </div>

      <div className="card-footer">
        <div className="card-footer-badges">
          {fileExtension && (
            <div className="format-badge" style={{ background: `rgba(${iconColor}, 0.12)`, color: `rgb(${iconColor})` }}>
              {fileExtension}
            </div>
          )}
          <div className={`status-badge status-badge--${expiryStatus.tone}`}>
            <div className="status-dot"></div>
            {expiryStatus.label}
          </div>
        </div>

        {!isSelectionMode && (
          <div className="card-actions-visible">
            {isDeleted ? (
              <button
                className="action-hover-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleState({ isDeleted: false });
                }}
                title="Restore"
              >
                <RefreshCcw size={16} />
              </button>
            ) : (
              <>
                <button
                  className="action-hover-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    playClick();
                    onToggleState({ isPinned: !isPinned });
                  }}
                  title={isPinned ? 'Unpin' : 'Pin'}
                >
                  <Pin size={16} fill={isPinned ? 'var(--color-3)' : 'none'} color={isPinned ? 'var(--color-3)' : 'currentColor'} />
                </button>
                <button
                  className="action-hover-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    playClick();
                    onPreview();
                  }}
                  title="Preview"
                >
                  <Eye size={16} />
                </button>
                <button
                  className="action-hover-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    playClick();
                    onToggleState({ isStarred: !isStarred });
                  }}
                  title={isStarred ? 'Unstar' : 'Star'}
                >
                  <Star size={16} fill={isStarred ? '#eab308' : 'none'} color={isStarred ? '#eab308' : 'currentColor'} />
                </button>
                {isDownloading && (
                  <div className="action-hover-btn" style={{ cursor: 'default' }}>
                    <RefreshCw size={16} className="spin" />
                  </div>
                )}
                <button
                  className="action-hover-btn danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    playClick();
                    onContextMenu(e);
                  }}
                  title="Options"
                >
                  <MoreVertical size={16} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileCard;
