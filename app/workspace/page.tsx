'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Workspace from '@/components/workspace/Workspace';
import { useAuthModal } from '@/context/AuthModalContext';
import { isLoggedInSync } from '@/hooks/useAuth';

export default function WorkspacePage() {
  const router = useRouter();
  const { openAuthModal } = useAuthModal();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (isLoggedInSync()) {
      setIsAuthenticated(true);
    } else {
      router.replace('/');
      openAuthModal('signin');
    }
    setChecked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked || !isAuthenticated) return null;

  return <Workspace />;
}
