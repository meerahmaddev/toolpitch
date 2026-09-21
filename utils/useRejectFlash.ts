import { useCallback, useRef, useState } from 'react';
import { soundManager } from './soundManager';

// Shared "this file was rejected" feedback (error sound + a brief red flash on the drop
// zone) so every upload zone reacts the same way instead of a silent toast being the
// only signal. `flashClass` is appended to the drop zone's className while active;
// styling/animation lives once in ToolPage.css (.reject-flash) and is reused everywhere.
export function useRejectFlash() {
  const [isRejecting, setIsRejecting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerReject = useCallback(() => {
    soundManager.playError();
    setIsRejecting(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsRejecting(false), 500);
  }, []);

  return { flashClass: isRejecting ? 'reject-flash' : '', triggerReject };
}
