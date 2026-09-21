'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, CheckCircle2 } from 'lucide-react';
import { message } from '@/utils/message';
import { Modal } from 'antd';
import { api } from '@/utils/apiClient';
import FileStagingZone from './FileStagingZone';
import TextToSpeechZone from './TextToSpeechZone';
import SpeechToTextZone from './SpeechToTextZone';
import ImageCompressorZone from './ImageCompressorZone';
import ImagesToPdfZone from './ImagesToPdfZone';
import MergePdfZone from './MergePdfZone';
import SplitPdfZone from './SplitPdfZone';
import CompressPdfZone from './CompressPdfZone';
import EditPdfZone from './EditPdfZone';
import ProcessingOverlay from './ProcessingOverlay';
import { toolsData, CATEGORY_TO_SLUG } from '@/components/home/ToolsSection';
import { setSuccessFile } from '@/utils/successHandoff';
import { FILE_SIZE_LIMITS_MB, FILE_SIZE_LIMIT_BYTES, categoryForMimetype, type FileSizeCategory } from '@/utils/fileLimits';
import { useRejectFlash } from '@/utils/useRejectFlash';
import './ToolPage.css';

interface StagedFile extends File {
  isUrl?: boolean;
  url?: string;
}

// The generic flow here covers several different input types (pdf-to-word, word-to-pdf,
// jpg-to-png, txt-to-pdf, ...) under one drop zone, so the size limit to show/enforce
// before a file is even picked has to be guessed from the toolId's input side - mirrors
// the toolId shape FileStagingZone.tsx already assumes ("<input>-to-<output>").
function inputCategoryForToolId(id: string): FileSizeCategory {
  const inputPart = id.split('-to-')[0];
  if (inputPart === 'pdf') return 'pdf';
  if (inputPart === 'txt') return 'text';
  if (inputPart === 'word' || inputPart === 'excel' || inputPart === 'ppt') return 'office';
  return 'image'; // jpg/png/webp/heic/svg and any other image variant
}

interface ToolPageProps {
  toolId: string;
  category?: string;
}

const ToolPage = ({ toolId, category }: ToolPageProps) => {
  const router = useRouter();

  const toolInfo = toolsData.find((t) => t.slug === toolId);
  const title = toolInfo?.title || toolId.replace(/-/g, ' ').toUpperCase();
  const description = toolInfo?.description || 'Convert and process your files securely.';
  const expectedCategory = inputCategoryForToolId(toolId);
  const expectedLimitMB = FILE_SIZE_LIMITS_MB[expectedCategory];

  const [isDragging, setIsDragging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState<number | undefined>(undefined);
  const { flashClass, triggerReject } = useRejectFlash();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const playClick = () => window.soundManager?.playClick();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const acceptFile = (file: File): boolean => {
    const category = categoryForMimetype(file.type);
    const limitBytes = FILE_SIZE_LIMIT_BYTES[category];
    if (file.size > limitBytes) {
      message.error(`File "${file.name}" is too large! Maximum ${FILE_SIZE_LIMITS_MB[category]}MB allowed.`);
      triggerReject();
      return false;
    }
    setStagedFiles([file]);
    playClick();
    return true;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 1) {
      message.info('Please upload one file at a time.');
    }
    if (files.length > 0) {
      acceptFile(files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      acceptFile(files[0]);
    }
    e.target.value = '';
  };

  const handleFileUpload = async (filesToProcess: StagedFile[], dynamicToolId: string) => {
    playClick();
    setIsProcessing(true);
    setProgressPercent(undefined);
    setProgressText(filesToProcess.length > 1 ? `Preparing batch (${filesToProcess.length} files)...` : 'Preparing upload...');

    const activeToolId = dynamicToolId || toolId;

    try {
      let response;
      if (filesToProcess.length === 1) {
        response = await api.processFile(filesToProcess[0], activeToolId);
      } else {
        response = await api.processBulkFiles(
          filesToProcess,
          activeToolId,
          (progressInfo) => {
            if (progressInfo.message) {
              setProgressText(progressInfo.message);
            } else if (progressInfo.current && progressInfo.total) {
              setProgressText(
                `Converting file ${progressInfo.current} of ${progressInfo.total}${
                  progressInfo.fileName ? ` (${progressInfo.fileName})` : ''
                }...`
              );
            }
            if (typeof progressInfo.progressPercent === 'number') {
              setProgressPercent(progressInfo.progressPercent);
            }
          }
        );
      }

      if (response.errors && response.errors.length > 0) {
        Modal.warning({
          title: 'Conversion Completed with Some Errors',
          content: (
            <div>
              <p>
                {response.successCount} files converted successfully, {response.failureCount} failed.
              </p>
              <ul style={{ marginTop: 10, paddingLeft: 20, maxHeight: 150, overflowY: 'auto' }}>
                {response.errors.map((err: { fileName: string; reason: string }, index: number) => (
                  <li key={index} style={{ marginBottom: 5 }}>
                    <strong>{err.fileName}</strong>: {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          ),
          okText: 'Download Successful Files',
          onOk: () => {
            setSuccessFile(response.file);
            router.push('/success');
          },
        });
      } else {
        message.success({ content: 'Conversion successful!', key: 'process' });
        setSuccessFile(response.file);
        router.push('/success');
      }

      setStagedFiles([]);
    } catch (error) {
      message.error({ content: (error instanceof Error && error.message) || 'Failed to process file', key: 'process' });
    } finally {
      setIsProcessing(false);
      setProgressText('');
      setProgressPercent(undefined);
    }
  };

  const handleTextToSpeech = async (text: string, voice: string, speed: string) => {
    message.loading({ content: 'Generating speech...', key: 'tts' });
    try {
      const response = await api.textToSpeech(text, voice, speed);
      message.success({ content: 'Speech generated successfully!', key: 'tts' });
      setSuccessFile(response.file);
      router.push('/success');
    } catch (error) {
      message.error({ content: (error instanceof Error && error.message) || 'Failed to generate speech', key: 'tts' });
    }
  };

  return (
    <div className="tool-page-container">
      <div className="tool-page-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="tool-drop-zone-wrapper">
        {toolId === 'text-to-speech' ? (
          <TextToSpeechZone onConvert={handleTextToSpeech} />
        ) : toolId === 'speech-to-text' ? (
          <SpeechToTextZone />
        ) : toolId === 'image-compressor' ? (
          <ImageCompressorZone />
        ) : toolId === 'images-to-pdf' ? (
          <ImagesToPdfZone />
        ) : toolId === 'merge-pdf' ? (
          <MergePdfZone />
        ) : toolId === 'split-pdf' ? (
          <SplitPdfZone />
        ) : toolId === 'compress-pdf' ? (
          <CompressPdfZone />
        ) : toolId === 'edit-pdf' ? (
          <EditPdfZone />
        ) : (
          <div
            className={`tool-drop-zone ${isDragging ? 'active-drag' : ''} ${stagedFiles.length > 0 ? 'has-file' : ''} ${flashClass}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {stagedFiles.length > 0 ? (
              <div className="fade-in" style={{ width: '100%' }}>
                <FileStagingZone
                  files={stagedFiles}
                  defaultToolId={toolId}
                  onConvert={handleFileUpload}
                  onCancel={() => setStagedFiles([])}
                  onFilesChange={(newFiles) => setStagedFiles(newFiles)}
                  onReject={triggerReject}
                />
              </div>
            ) : (
              <>
                <UploadCloud size={64} className="zone-icon" />
                <h2 className="zone-title">Drag & drop file here</h2>
                <p className="zone-subtitle">or</p>
                <p className="zone-subtitle" style={{ fontSize: '0.85rem', opacity: 0.7 }}>Maximum file size: {expectedLimitMB}MB</p>

                <button
                  className="split-btn-main mt-4"
                  onClick={() => {
                    playClick();
                    fileInputRef.current?.click();
                  }}
                >
                  <UploadCloud size={18} color="#ffffff" style={{ minWidth: '18px' }} /> CHOOSE FILE
                </button>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
              </>
            )}
          </div>
        )}
      </div>

      <ProcessingOverlay
        isVisible={isProcessing}
        text={progressText || 'Processing... Please wait.'}
        progress={progressPercent}
      />

      <div className="tool-features">
        <div className="feature-item">
          <CheckCircle2 size={20} color="#10b981" />
          <span>Fast & secure online conversion</span>
        </div>
        <div className="feature-item">
          <CheckCircle2 size={20} color="#10b981" />
          <span>No installation needed</span>
        </div>
        <div className="feature-item">
          <CheckCircle2 size={20} color="#10b981" />
          <span>Files are encrypted with TLS</span>
        </div>
      </div>
    </div>
  );
};

export default ToolPage;
