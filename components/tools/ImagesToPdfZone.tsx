'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Trash2, Crop as CropIcon, RotateCw, FileText, Plus, X, UploadCloud } from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { message } from '@/utils/message';
import { api } from '@/utils/apiClient';
import { cropRotateToBlob, loadImage } from '@/utils/imageCanvas';
import { FILE_SIZE_LIMITS_MB, FILE_SIZE_LIMIT_BYTES } from '@/utils/fileLimits';
import { useRejectFlash } from '@/utils/useRejectFlash';
import ProcessingOverlay from './ProcessingOverlay';
import { useDownloadGuard } from '@/hooks/useDownloadGuard';
import './ImagesToPdfZone.css';

interface PdfItem {
  file: File;
  previewUrl: string;
  rotation: number;
  fileSizeStr: string;
  originalName: string;
}

type PageSize = 'a4' | 'letter' | 'fit';
type Orientation = 'auto' | 'portrait' | 'landscape';
type Margin = 'none' | 'normal' | 'wide';

// Matches the 5MB per-image cap enforced server-side (assertFileSizeAllowed in
// lib/converter/validation.ts, checked again in app/api/converter/images-to-pdf/route.ts).
const MAX_IMAGE_SIZE_MB = FILE_SIZE_LIMITS_MB.image;
const MAX_IMAGE_SIZE_BYTES = FILE_SIZE_LIMIT_BYTES.image;

const ImagesToPdfZone = () => {
  const { requireAuthToDownload } = useDownloadGuard();
  const [items, setItems] = useState<PdfItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { flashClass, triggerReject } = useRejectFlash();

  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [margin, setMargin] = useState<Margin>('normal');

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [crop, setCrop] = useState<Crop>({ unit: '%', width: 50, height: 50, x: 25, y: 25 });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const allSelected = Array.from(e.target.files || []);
    const wrongType = allSelected.filter((f) => !f.type.startsWith('image/'));
    if (wrongType.length > 0) {
      message.error('Only image files are allowed.');
      triggerReject();
    }

    const imageFiles = allSelected.filter((f) => f.type.startsWith('image/'));
    const oversized = imageFiles.filter((f) => f.size > MAX_IMAGE_SIZE_BYTES);
    if (oversized.length > 0) {
      message.error(`Maximum ${MAX_IMAGE_SIZE_MB}MB per image. Too large: ${oversized.map((f) => f.name).join(', ')}`);
      triggerReject();
    }
    const selectedFiles = imageFiles.filter((f) => f.size <= MAX_IMAGE_SIZE_BYTES);

    if (items.length + selectedFiles.length > 20) {
      message.error('You can only convert up to 20 images to PDF at once.');
      triggerReject();
      e.target.value = '';
      return;
    }

    const newItems: PdfItem[] = selectedFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      rotation: 0,
      fileSizeStr: formatSize(file.size),
      originalName: file.name,
    }));

    setItems((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const removeFile = (indexToRemove: number) => {
    URL.revokeObjectURL(items[indexToRemove].previewUrl);
    setItems(items.filter((_, index) => index !== indexToRemove));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      (e.target as HTMLElement).classList.add('dragging');
    }, 0);
  };

  const handleDragEnter = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const newItems = [...items];
    const draggedItem = newItems[draggedIndex];
    newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);

    setDraggedIndex(targetIndex);
    setItems(newItems);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
    (e.target as HTMLElement).classList.remove('dragging');
  };

  const handleInstantRotate = (index: number) => {
    const newItems = [...items];
    newItems[index].rotation = (newItems[index].rotation + 90) % 360;
    setItems(newItems);
  };

  const openEditor = (index: number) => {
    setEditingIndex(index);
    setCrop({ unit: '%', width: 50, height: 50, x: 25, y: 25 });
    setCompletedCrop(null);
  };

  const closeEditor = () => {
    setEditingIndex(null);
  };

  const saveCrop = async () => {
    if (editingIndex === null || !imgRef.current) return;

    let currentCrop: { x: number; y: number; width: number; height: number } | null = completedCrop;
    if (!currentCrop || (currentCrop.width === 0 && currentCrop.height === 0)) {
      currentCrop = { x: 0, y: 0, width: imgRef.current.width, height: imgRef.current.height };
    }

    try {
      const item = items[editingIndex];
      const croppedBlob = await cropRotateToBlob(item.previewUrl, currentCrop, 0, imgRef.current);

      const newItems = [...items];
      URL.revokeObjectURL(newItems[editingIndex].previewUrl);
      newItems[editingIndex] = {
        ...item,
        file: new File([croppedBlob], `cropped_${Date.now()}.jpg`, { type: 'image/jpeg' }),
        previewUrl: URL.createObjectURL(croppedBlob),
        rotation: item.rotation,
        fileSizeStr: formatSize(croppedBlob.size),
      };

      setItems(newItems);
      closeEditor();
    } catch (e) {
      message.error('Error saving crop: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleApply = () => {
    if (items.length === 0) {
      message.error('Please upload at least 1 image to convert to PDF.');
      return;
    }

    requireAuthToDownload(async () => {
      setIsProcessing(true);

      try {
        const finalBlobs = await Promise.all(
          items.map(async (item) => {
            if (item.rotation === 0) {
              return item.file;
            }
            const image = await loadImage(item.previewUrl);
            const fullCrop = { x: 0, y: 0, width: image.width, height: image.height };
            return cropRotateToBlob(item.previewUrl, fullCrop, item.rotation);
          })
        );

        const finalFiles = finalBlobs.map((blob, i) => new File([blob], items[i].originalName, { type: 'image/jpeg' }));

        const pdfBlob = await api.imagesToPdf(finalFiles, { pageSize, orientation, margin });
        const url = URL.createObjectURL(pdfBlob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `Document_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'Failed to generate PDF');
      } finally {
        setIsProcessing(false);
      }
    });
  };

  const playClick = () => window.soundManager?.playClick();

  const handleInitialDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect({
        target: { files: e.dataTransfer.files } as unknown as HTMLInputElement,
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  return (
    <div className="images-to-pdf-container fade-in">
      <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />

      {items.length === 0 ? (
        <div
          className={`tool-drop-zone ${flashClass}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={handleInitialDrop}
          onClick={() => {
            playClick();
            fileInputRef.current?.click();
          }}
        >
          <UploadCloud size={64} className="zone-icon" />
          <h2 className="zone-title">Convert Images to PDF</h2>
          <p className="zone-subtitle">Upload images to combine them into a single PDF document</p>
          <p className="zone-subtitle" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
            Maximum file size: {MAX_IMAGE_SIZE_MB}MB per image
          </p>
          <button
            className="split-btn-main mt-4"
            onClick={(e) => {
              e.stopPropagation();
              playClick();
              fileInputRef.current?.click();
            }}
          >
            <UploadCloud size={18} color="#ffffff" style={{ minWidth: '18px' }} /> CHOOSE IMAGES
          </button>
        </div>
      ) : (
        <div className={`pdf-scanner-studio ${flashClass}`}>
          <div className="page-setup-bar">
            <div className="page-setup-field">
              <label>Page Size</label>
              <select value={pageSize} onChange={(e) => setPageSize(e.target.value as PageSize)}>
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
                <option value="fit">Fit to Image</option>
              </select>
            </div>
            <div className="page-setup-field">
              <label>Orientation</label>
              <select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)} disabled={pageSize === 'fit'}>
                <option value="auto">Auto (match image)</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
            <div className="page-setup-field">
              <label>Margin</label>
              <select value={margin} onChange={(e) => setMargin(e.target.value as Margin)}>
                <option value="none">None (edge-to-edge)</option>
                <option value="normal">Normal</option>
                <option value="wide">Wide</option>
              </select>
            </div>
          </div>

          <div className="scanner-main">
            <div className="scanner-grid">
              {items.map((item, index) => (
                <div
                  key={item.previewUrl}
                  className={`scanner-card ${draggedIndex === index ? 'dragging-placeholder' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <div className="card-preview">
                    <img src={item.previewUrl} alt={item.originalName} style={{ transform: `rotate(${item.rotation}deg)` }} />
                    <div className="card-badge">{index + 1}</div>
                    <div className="card-actions-overlay">
                      <button className="card-action-btn" title="Rotate" onClick={() => handleInstantRotate(index)}>
                        <RotateCw size={14} />
                      </button>
                      <button className="card-action-btn" title="Crop" onClick={() => openEditor(index)}>
                        <CropIcon size={14} />
                      </button>
                      <button className="card-action-btn danger" title="Remove" onClick={() => removeFile(index)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="card-footer">
                    <span className="file-name">{item.originalName}</span>
                  </div>
                </div>
              ))}

              {items.length < 20 && (
                <div className="add-more-card" onClick={() => fileInputRef.current?.click()}>
                  <div className="add-more-circle">
                    <Plus size={32} />
                  </div>
                  <span>Add Images</span>
                </div>
              )}
            </div>
          </div>

          <div className="scanner-bottom-bar">
            <button className="bottom-select-btn" onClick={() => fileInputRef.current?.click()} disabled={items.length >= 20}>
              <Upload size={18} /> Add Images
            </button>

            <button className="bottom-convert-btn" onClick={handleApply} disabled={isProcessing || items.length === 0}>
              {isProcessing ? 'Generating...' : 'Convert To PDF'}
            </button>
          </div>
        </div>
      )}

      {editingIndex !== null && (
        <div className="edit-modal-overlay">
          <div className="edit-modal">
            <div className="edit-modal-header">
              <h3>Crop Image</h3>
              <button className="close-btn" onClick={closeEditor}>
                <X size={20} />
              </button>
            </div>

            <div className="edit-modal-body">
              <div className="crop-container" style={{ transform: `rotate(${items[editingIndex].rotation}deg)` }}>
                <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)}>
                  <img ref={imgRef} src={items[editingIndex].previewUrl} alt="Crop preview" style={{ maxHeight: '400px', maxWidth: '100%' }} />
                </ReactCrop>
              </div>
            </div>

            <div className="edit-modal-footer" style={{ justifyContent: 'flex-end' }}>
              <div className="modal-actions">
                <button className="cancel-btn" onClick={closeEditor}>
                  Cancel
                </button>
                <button className="save-btn" onClick={saveCrop}>
                  Apply Crop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="edit-modal-overlay" onClick={() => setPreviewImage(null)}>
          <div className="edit-modal" style={{ background: 'transparent', boxShadow: 'none', border: 'none', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} alt="Preview" />
            <button className="pdf-icon-btn" style={{ position: 'absolute', top: '-15px', right: '-15px', background: 'white', color: 'black' }} onClick={() => setPreviewImage(null)}>
              <X size={24} />
            </button>
          </div>
        </div>
      )}
      <ProcessingOverlay isVisible={isProcessing} text="Converting Images to PDF..." />
    </div>
  );
};

export default ImagesToPdfZone;
