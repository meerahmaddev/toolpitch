'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Background from './Background';
import Header from './Header';
import Footer from './Footer';
import AuthModal from '@/components/auth/AuthModal';
import ForgotPasswordModal from '@/components/auth/ForgotPasswordModal';
import { AuthModalProvider } from '@/context/AuthModalContext';
import { soundManager } from '@/utils/soundManager';

export default function AppShell({ children }: { children: ReactNode }) {
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.soundManager = soundManager;

    const handleMouseMove = (e: MouseEvent) => {
      if (appRef.current) {
        const { clientX, clientY } = e;
        const xPos = (clientX / window.innerWidth - 0.5) * 40;
        const yPos = (clientY / window.innerHeight - 0.5) * 40;
        appRef.current.style.setProperty('--mouseX', `${xPos}px`);
        appRef.current.style.setProperty('--mouseY', `${yPos}px`);
      }
    };

    const handleScroll = () => {
      if (appRef.current) {
        const threshold = window.innerHeight * 0.8;
        if (window.scrollY > threshold) {
          appRef.current.classList.add('hero-scrolled-past');
        } else {
          appRef.current.classList.remove('hero-scrolled-past');
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''}>
      <AuthModalProvider>
        <div className="app-container" ref={appRef}>
          <Background />
          <div className="content-overlay">
            <Header />
            <main className="main-content">{children}</main>
            <Footer />
          </div>

          <AuthModal />
          <ForgotPasswordModal />
        </div>
      </AuthModalProvider>
    </GoogleOAuthProvider>
  );
}
