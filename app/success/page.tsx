'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, ArrowLeft, FolderOpen } from 'lucide-react';
import { message } from '@/utils/message';
import { api, authHeader } from '@/utils/apiClient';
import { getAndClearSuccessFile, type HandoffFile } from '@/utils/successHandoff';
import { useDownloadGuard } from '@/hooks/useDownloadGuard';
import './ConversionSuccess.css';

export default function ConversionSuccess() {
  const router = useRouter();
  const { requireAuthToDownload } = useDownloadGuard();
  const [file, setFile] = useState<HandoffFile | null>(null);
  const [checked, setChecked] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [audioFailed, setAudioFailed] = useState(false);

  useEffect(() => {
    const handoff = getAndClearSuccessFile();
    setFile(handoff);
    setChecked(true);
    if (!handoff) {
      router.replace('/tools');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // <audio src> can't carry an Authorization header, and the download route
  // requires one for logged-in users' files (guest files worked "by accident"
  // since they skip that check) - so fetch the bytes ourselves and hand the
  // player a blob URL instead, same pattern used for Workspace thumbnails/previews.
  useEffect(() => {
    if (!file || file.originalName.split('.').pop()?.toUpperCase() !== 'MP3') return;
    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(`/api/converter/download/${file.filename}?inline=true`, { headers: authHeader() })
      .then((res) => {
        if (!res.ok) throw new Error('Audio unavailable');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setAudioFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  if (!checked || !file) return null;

  const playClick = () => window.soundManager?.playClick();

  const executeDownload = async () => {
    try {
      message.loading({ content: 'Starting download...', key: 'dl' });
      await api.downloadFile(file.filename, file.originalName);
      message.success({ content: 'Download started!', key: 'dl' });
    } catch {
      message.error({ content: 'Failed to download file', key: 'dl' });
    }
  };

  const handleDownload = () => {
    playClick();
    requireAuthToDownload(executeDownload);
  };

  const ext = file.originalName.split('.').pop()?.toUpperCase() || '';
  const titleText = `File has been converted to ${ext}`;

  return (
    <div className="success-page-container">
      <div className="success-header-wrapper">
        <h1 className="success-page-title">{titleText}</h1>
      </div>

      <div className="success-card">
        {ext === 'MP3' && (
          <div className="audio-player-wrapper fade-in">
            {audioBlobUrl ? (
              <audio controls autoPlay src={audioBlobUrl}>
                Your browser does not support the audio element.
              </audio>
            ) : audioFailed ? (
              <p className="audio-player-error">Couldn&apos;t load audio preview — you can still download the file below.</p>
            ) : (
              <p className="audio-player-loading">Loading preview…</p>
            )}
          </div>
        )}

        <div className="success-main-actions">
          <button
            className="back-circle-btn"
            onClick={() => {
              playClick();
              router.back();
            }}
            title="Convert another file"
          >
            <ArrowLeft size={24} />
          </button>

          <button className="mega-download-btn" onClick={handleDownload}>
            <Download size={28} strokeWidth={2.5} />
            <span>
              Download {ext} {ext === 'MP3' ? 'audio' : 'file'}
            </span>
          </button>
        </div>
      </div>

      <div className="success-bottom-actions">
        <div className="continue-box">
          <p>Continue to...</p>
          <div className="continue-options">
            <Link href="/workspace" className="continue-link" onClick={playClick}>
              <div className="continue-icon-wrap">
                <FolderOpen size={20} color="#7b3183" />
              </div>
              <span>My Workspace</span>
              <span className="arrow-right">&rsaquo;</span>
            </Link>
          </div>
        </div>

        <div className="privacy-box">
          <h3>Secure. Private. In your control</h3>
          <p>
            Your files are securely processed with no storage, no tracking, and complete privacy. Converted files are always handled safely
            and automatically deleted after 24 hours to protect your privacy.
            <a href="#"> Learn more</a>
          </p>
          <div className="security-badges">
            <div className="badge">ISO 27001</div>
            <div className="badge">SECURE SSL ENCRYPTION</div>
          </div>
        </div>
      </div>
    </div>
  );
}
