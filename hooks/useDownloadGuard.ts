'use client';

import { useAuthModal } from '@/context/AuthModalContext';
import { isLoggedInSync } from '@/hooks/useAuth';
import { message } from '@/utils/message';

export function useDownloadGuard() {
  const { openAuthModal } = useAuthModal();

  const requireAuthToDownload = (onAuthorizedDownload: () => void | Promise<void>): boolean => {
    if (isLoggedInSync()) {
      onAuthorizedDownload();
      return true;
    }

    message.info('Please sign up or log in to download your file.');
    openAuthModal('signup', {
      redirectUrl: null,
      onSuccess: () => {
        void onAuthorizedDownload();
      },
    });
    return false;
  };

  return { requireAuthToDownload };
}
