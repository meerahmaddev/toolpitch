'use client';

import { useEffect, useState } from 'react';

export interface ActiveUser {
  email: string;
  username: string;
}

function readActiveUser(): ActiveUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('convertify_active_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Mirrors the token/user check pattern used across Header, ProtectedRoute, etc. */
export function useAuth() {
  const [user, setUser] = useState<ActiveUser | null>(null);
  const [isChecked, setIsChecked] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      setUser(readActiveUser());
      setIsChecked(true);
    };

    checkAuth();
    window.addEventListener('auth_change', checkAuth);
    return () => window.removeEventListener('auth_change', checkAuth);
  }, []);

  const logout = () => {
    localStorage.removeItem('convertify_token');
    localStorage.removeItem('convertify_refresh_token');
    localStorage.removeItem('convertify_active_user');
    window.dispatchEvent(new Event('auth_change'));
  };

  return { user, isAuthenticated: !!user, isChecked, logout };
}

export function isLoggedInSync(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('convertify_token');
}
