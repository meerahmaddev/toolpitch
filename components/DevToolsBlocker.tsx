'use client';

import { useEffect, useState } from 'react';
import DisableDevtool from 'disable-devtool';

export default function DevToolsBlocker() {
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    // Only block in production mode
    if (process.env.NODE_ENV !== 'production') return;

    // 1. Initialize professional anti-devtool detector
    DisableDevtool({
      ondevtoolopen: () => {
        setDetected(true);
      },
      ondevtoolclose: () => {
        setDetected(false);
      },
      disableMenu: true, // Right-click contextmenu disabled
      clearLog: true,    // Keep console cleared
      interval: 200,     // Fast check every 200ms
    });

    // 2. Extra safety for shortcuts
    const blockShortcuts = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isBlocked =
        key === 'F12' ||
        (isCtrlOrCmd && e.shiftKey && ['I', 'J', 'C'].includes(key)) ||
        (isCtrlOrCmd && e.altKey && ['I', 'J', 'C'].includes(key)) ||
        (isCtrlOrCmd && key === 'U');

      if (isBlocked) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', blockShortcuts);

    return () => {
      document.removeEventListener('keydown', blockShortcuts);
    };
  }, []);

  if (!detected) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999999,
        background: 'rgba(11, 11, 15, 0.98)',
        backdropFilter: 'blur(16px)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 24,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ maxWidth: 440 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🛡️</div>
        <h2 style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 10 }}>Developer Tools Detected</h2>
        <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
          Security policy: Please close Inspect / Developer Tools to continue using Convertify.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}
