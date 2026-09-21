'use client';

import { useRef, useState } from 'react';
import { Move } from 'lucide-react';

interface Props {
  imageId: string;
  originalRectPx: { left: number; top: number; width: number; height: number };
  currentRectPx: { left: number; top: number; width: number; height: number };
  thumbnailSrc: string | null;
  bgColorHex: string;
  moved: boolean;
  onMove: (imageId: string, deltaLeftPx: number, deltaTopPx: number) => void;
}

const DraggableImage = ({ imageId, originalRectPx, currentRectPx, thumbnailSrc, bgColorHex, moved, onMove }: Props) => {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (dx === 0 && dy === 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    onMove(imageId, dx, dy);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragStart.current = null;
    setDragging(false);
  };

  return (
    <>
      {moved && (
        <div
          style={{
            position: 'absolute',
            left: originalRectPx.left,
            top: originalRectPx.top,
            width: originalRectPx.width,
            height: originalRectPx.height,
            background: bgColorHex,
          }}
        />
      )}
      <div
        className={`edit-pdf-image-handle${dragging ? ' dragging' : ''}`}
        style={{
          left: currentRectPx.left,
          top: currentRectPx.top,
          width: currentRectPx.width,
          height: currentRectPx.height,
          backgroundImage: thumbnailSrc ? `url(${thumbnailSrc})` : undefined,
          backgroundSize: '100% 100%',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Drag to reposition"
      >
        <Move size={16} style={{ position: 'absolute', top: 4, right: 4, opacity: 0.7, color: '#3b82f6' }} />
      </div>
    </>
  );
};

export default DraggableImage;
