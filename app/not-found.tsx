'use client';

import Link from 'next/link';
import { SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        minHeight: '60vh',
        padding: '80px 20px',
      }}
    >
      <div
        style={{
          width: '84px',
          height: '84px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '28px',
        }}
      >
        <SearchX size={38} color="var(--color-5)" />
      </div>

      <h1 style={{ fontSize: '4.5rem', fontWeight: 800, letterSpacing: '-2px', lineHeight: 1, marginBottom: '16px' }}>
        404
      </h1>
      <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', maxWidth: '420px', marginBottom: '32px' }}>
        Oops! The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          className="btn-start-converting"
          onClick={() => {
            window.soundManager?.playClick();
            window.location.href = '/';
          }}
        >
          Return to Home
        </button>
        <Link
          href="/tools"
          onClick={() => window.soundManager?.playClick()}
          style={{
            background: 'var(--btn-secondary-bg)',
            color: 'var(--btn-secondary-text)',
            padding: '0.9rem 2rem',
            fontSize: '1rem',
            fontWeight: 600,
            borderRadius: '999px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Browse All Tools
        </Link>
      </div>
    </div>
  );
}
