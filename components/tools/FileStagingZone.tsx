'use client';

import { useState, useRef } from 'react';
import { X, ArrowRight, Plus, Trash2, File, FileImage, FileText, Music } from 'lucide-react';
import { message } from 'antd';
import { FILE_SIZE_LIMITS_MB, FILE_SIZE_LIMIT_BYTES, categoryForMimetype } from '@/utils/fileLimits';
import './FileStagingZone.css';

export type StagedFile = File & { isUrl?: boolean; url?: string };

const FORMAT_LABELS: Record<string, string> = {
  DOCX: 'Word Document (.docx)',
  XLSX: 'Excel Spreadsheet (.xlsx)',
  PPTX: 'PowerPoint (.pptx)',
  PDF: 'PDF Document (.pdf)',
  TXT: 'Plain Text (.txt)',
  JPG: 'JPG Image (.jpg)',
  PNG: 'PNG Image (.png)',
  WEBP: 'WebP Image (.webp)',
  MP3: 'MP3 Audio (.mp3)',
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getSupportedFormats = (filename: string): string[] => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (ext === 'pdf') return ['DOCX', 'XLSX', 'PPTX', 'JPG', 'PNG'];
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return ['PDF'];
  if (ext === 'txt') return ['PDF', 'MP3'];
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return ['TXT'];
  if (['jpg', 'jpeg', 'jfif', 'png', 'webp', 'heic', 'svg'].includes(ext)) return ['PDF', 'JPG', 'PNG', 'WEBP'];

  return ['PDF', 'JPG', 'PNG'];
};

const getDefaultFormat = (filename: string, defaultToolId?: string): string => {
  const supported = getSupportedFormats(filename);
  if (defaultToolId) {
    let target = '';
    if (defaultToolId.endsWith('-to-pdf')) target = 'PDF';
    else if (defaultToolId === 'pdf-to-word') target = 'DOCX';
    else if (defaultToolId === 'pdf-to-excel') target = 'XLSX';
    else if (defaultToolId === 'pdf-to-ppt') target = 'PPTX';
    else if (defaultToolId === 'pdf-to-images') target = 'JPG';
    else if (defaultToolId.includes('-to-png')) target = 'PNG';
    else if (defaultToolId.includes('-to-jpg')) target = 'JPG';
    else if (defaultToolId.includes('-to-webp')) target = 'WEBP';
    else if (defaultToolId === 'text-to-speech') target = 'MP3';
    else if (defaultToolId === 'speech-to-text') target = 'TXT';

    if (target && supported.includes(target)) {
      return target;
    }
  }

  return supported[0] || 'PDF';
};

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'jfif', 'png', 'webp', 'heic', 'svg', 'gif', 'bmp'].includes(ext)) {
    return <FileImage size={18} className="file-item-icon image" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    return <FileText size={18} className="file-item-icon doc" />;
  }
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) {
    return <Music size={18} className="file-item-icon audio" />;
  }
  return <File size={18} className="file-item-icon default" />;
};

interface FileStagingZoneProps {
  files: StagedFile[];
  defaultToolId?: string;
  onConvert: (files: StagedFile[], toolId: string) => void;
  onCancel: () => void;
  onFilesChange?: (files: StagedFile[]) => void;
  onReject?: () => void;
}

const FileStagingZone = ({ files, defaultToolId, onConvert, onCancel, onFilesChange, onReject }: FileStagingZoneProps) => {
  const firstFile = files[0];
  const availableFormats = firstFile ? getSupportedFormats(firstFile.name) : ['PDF'];
  const [outputFormat, setOutputFormat] = useState(firstFile ? getDefaultFormat(firstFile.name, defaultToolId) : 'PNG');
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  const playClick = () => window.soundManager?.playClick();

  const handleConvertClick = () => {
    if (!firstFile) return;
    playClick();

    const ext = firstFile.name.split('.').pop()?.toLowerCase() || '';
    let inputFormat = (ext === 'jpeg' || ext === 'jfif') ? 'jpg' : ext;

    if (['doc', 'docx'].includes(inputFormat)) inputFormat = 'word';
    if (['xls', 'xlsx'].includes(inputFormat)) inputFormat = 'excel';
    if (['ppt', 'pptx'].includes(inputFormat)) inputFormat = 'ppt';

    if (outputFormat === 'PDF' && ['jpg', 'png', 'webp', 'heic', 'svg'].includes(inputFormat)) {
      inputFormat = 'images';
    }

    let outFormat = outputFormat.toLowerCase();
    if (outFormat === 'docx') outFormat = 'word';
    if (outFormat === 'xlsx') outFormat = 'excel';
    if (outFormat === 'pptx') outFormat = 'ppt';

    if (inputFormat === outFormat) {
      message.warning(`The file is already in ${outputFormat} format. Please choose a different target format.`);
      return;
    }

    let toolId = `${inputFormat}-to-${outFormat}`;

    if (inputFormat === 'pdf' && ['jpg', 'png'].includes(outFormat)) toolId = 'pdf-to-images';
    if (inputFormat === 'txt' && outFormat === 'mp3') toolId = 'text-to-speech';
    if (['mp3', 'wav', 'm4a', 'ogg'].includes(inputFormat) && outFormat === 'text') toolId = 'speech-to-text';

    onConvert(files, toolId);
  };

  const handleRemoveFile = (indexToRemove: number) => {
    playClick();
    const updated = files.filter((_, index) => index !== indexToRemove);
    if (updated.length === 0) {
      onCancel();
    } else {
      onFilesChange?.(updated);
    }
  };

  const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const file = selectedFiles[0];
    const category = categoryForMimetype(file.type);

    if (file.size > FILE_SIZE_LIMIT_BYTES[category]) {
      message.error(`File "${file.name}" is too large! Maximum ${FILE_SIZE_LIMITS_MB[category]}MB allowed.`);
      onReject?.();
      e.target.value = '';
      return;
    }

    playClick();
    onFilesChange?.([file]);
    e.target.value = '';
  };

  const totalSize = files.reduce((acc, file) => acc + (file.size || 0), 0);

  return (
    <div className="file-staging-zone">
      {/* Hidden file input for changing file */}
      <input
        type="file"
        ref={addMoreInputRef}
        style={{ display: 'none' }}
        onChange={handleAddMoreFiles}
      />

      <div className="staging-header">
        <div className="staging-header-actions">
          <button
            type="button"
            className="add-more-btn"
            onClick={() => {
              playClick();
              addMoreInputRef.current?.click();
            }}
          >
            <Plus size={16} /> Change File
          </button>
          <button
            type="button"
            className="clear-selection-btn"
            onClick={() => {
              playClick();
              onCancel();
            }}
          >
            <Trash2 size={15} /> Clear
          </button>
        </div>

        <div className="output-selector-header">
          <span className="output-label">Output:</span>
          <select
            className="output-dropdown"
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value)}
          >
            {availableFormats.map((fmt) => (
              <option key={fmt} value={fmt}>
                {FORMAT_LABELS[fmt] || fmt}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="staging-body" style={{ maxHeight: '320px', overflowY: 'auto' }}>
        {files.map((file, index) => (
          <div className="staged-file-row" key={`${file.name}-${index}`}>
            <div className="file-info-col">
              <div className="file-item-header">
                {getFileIcon(file.name)}
                <span className="file-name-text" title={file.name}>
                  {file.name}
                </span>
              </div>
              <span className="file-size">{formatBytes(file.size || 0)}</span>
            </div>

            <div className="file-item-actions">
              <button
                type="button"
                className="remove-single-file-btn"
                title={`Remove ${file.name}`}
                onClick={() => handleRemoveFile(index)}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="staging-footer">
        <div className="footer-left">
          <span>
            {files.length} file{files.length > 1 ? 's' : ''} ({formatBytes(totalSize)})
          </span>
        </div>
        <button className="convert-action-btn" onClick={handleConvertClick}>
          Convert {files.length > 1 ? 'All ' : ''}
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default FileStagingZone;
