'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type AuthMode = 'signin' | 'signup';
type ForgotMode = 'forgot' | 'verify';

export interface AuthModalOptions {
  onSuccess?: () => void;
  redirectUrl?: string | null;
}

interface AuthModalContextValue {
  isAuthModalOpen: boolean;
  authMode: AuthMode;
  authOptions: AuthModalOptions | null;
  isForgotModalOpen: boolean;
  forgotModalMode: ForgotMode;
  verifyEmail: string;
  openAuthModal: (mode: AuthMode, options?: AuthModalOptions) => void;
  closeAuthModal: () => void;
  openForgotModal: () => void;
  openVerifyModal: (email: string) => void;
  closeForgotModal: () => void;
  backToLogin: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authOptions, setAuthOptions] = useState<AuthModalOptions | null>(null);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotModalMode, setForgotModalMode] = useState<ForgotMode>('forgot');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('signin');

  const openAuthModal = useCallback((mode: AuthMode, options?: AuthModalOptions) => {
    setAuthMode(mode);
    setAuthOptions(options || null);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setAuthOptions(null);
  }, []);

  const openForgotModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setForgotModalMode('forgot');
    setVerifyEmail('');
    setIsForgotModalOpen(true);
  }, []);

  const openVerifyModal = useCallback((email: string) => {
    setIsAuthModalOpen(false);
    setForgotModalMode('verify');
    setVerifyEmail(email);
    setIsForgotModalOpen(true);
  }, []);

  const closeForgotModal = useCallback(() => setIsForgotModalOpen(false), []);

  const backToLogin = useCallback(() => {
    setIsForgotModalOpen(false);
    setAuthMode('signin');
    setIsAuthModalOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      isAuthModalOpen,
      authMode,
      authOptions,
      isForgotModalOpen,
      forgotModalMode,
      verifyEmail,
      openAuthModal,
      closeAuthModal,
      openForgotModal,
      openVerifyModal,
      closeForgotModal,
      backToLogin,
    }),
    [isAuthModalOpen, authMode, authOptions, isForgotModalOpen, forgotModalMode, verifyEmail, openAuthModal, closeAuthModal, openForgotModal, openVerifyModal, closeForgotModal, backToLogin]
  );

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider');
  return ctx;
}
