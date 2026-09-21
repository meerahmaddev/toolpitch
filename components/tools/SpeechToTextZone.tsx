'use client';

import { useState, useRef } from 'react';
import { Upload, Mic, Square, FileText, File as FileIcon } from 'lucide-react';
import { message } from '@/utils/message';
import { api } from '@/utils/apiClient';
import { FILE_SIZE_LIMITS_MB, FILE_SIZE_LIMIT_BYTES } from '@/utils/fileLimits';
import { useRejectFlash } from '@/utils/useRejectFlash';
import ProcessingOverlay from './ProcessingOverlay';
import { useDownloadGuard } from '@/hooks/useDownloadGuard';
import './SpeechToTextZone.css';

// Matches the 5MB audio cap enforced server-side (assertFileSizeAllowed in
// lib/converter/validation.ts, checked again in app/api/converter/speech-to-text/route.ts).
const MAX_AUDIO_SIZE_MB = FILE_SIZE_LIMITS_MB.audio;
const MAX_AUDIO_SIZE_BYTES = FILE_SIZE_LIMIT_BYTES.audio;

const LANGUAGE_OPTIONS = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'en', label: 'English' },
  { id: 'ur', label: 'Urdu' },
  { id: 'hi', label: 'Hindi' },
  { id: 'ar', label: 'Arabic' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
];

const SpeechToTextZone = () => {
  const { requireAuthToDownload } = useDownloadGuard();
  const [isRecording, setIsRecording] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [language, setLanguage] = useState('auto');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { flashClass, triggerReject } = useRejectFlash();

  const processAudio = async (file: File) => {
    setIsProcessing(true);
    message.loading({ content: 'Transcribing audio...', key: 'stt' });
    try {
      const res = await api.speechToText(file, language === 'auto' ? undefined : language);
      setTranscribedText((prev) => (prev ? prev + '\n\n' + res.text : res.text));
      if (res.language) setDetectedLanguage(res.language);
      message.success({ content: 'Transcription complete!', key: 'stt' });
    } catch (error) {
      message.error({ content: (error instanceof Error && error.message) || 'Failed to transcribe', key: 'stt' });
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
        await processAudio(file);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      message.success('Recording started...');
    } catch {
      message.error('Microphone access denied or not available.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/x-m4a', 'video/mp4'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|webm|m4a|mp4)$/i)) {
      message.error('Please upload a valid audio file (MP3, WAV, M4A, etc.)');
      triggerReject();
      event.target.value = '';
      return;
    }

    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      message.error(`File "${file.name}" is too large! Maximum ${MAX_AUDIO_SIZE_MB}MB allowed.`);
      triggerReject();
      event.target.value = '';
      return;
    }

    await processAudio(file);
    event.target.value = '';
  };

  const handleDownload = (format: string) => {
    if (!transcribedText.trim()) {
      message.warning('No text to download.');
      return;
    }

    requireAuthToDownload(async () => {
      try {
        message.loading({ content: `Generating ${format.toUpperCase()} file...`, key: 'export' });
        const blob = await api.exportText(transcribedText, format);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcription.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        message.success({ content: 'File downloaded successfully!', key: 'export' });
      } catch {
        message.error({ content: 'Failed to export text', key: 'export' });
      }
    });
  };

  return (
    <div className={`stt-zone-container ${flashClass}`}>
      <div className="stt-input-actions">
        <button className={`stt-record-btn ${isRecording ? 'stt-recording' : ''}`} onClick={isRecording ? stopRecording : startRecording} disabled={isProcessing}>
          {isRecording ? <Square size={20} fill="currentColor" /> : <Mic size={20} />}
          <span>{isRecording ? 'Stop Recording' : 'Live Record'}</span>
        </button>

        <div className="stt-upload-btn-wrapper">
          <input type="file" accept="audio/*,video/mp4" onChange={handleFileUpload} id="audio-upload" disabled={isProcessing || isRecording} />
          <label htmlFor="audio-upload" className={`stt-upload-btn ${isProcessing || isRecording ? 'stt-disabled' : ''}`}>
            <Upload size={20} />
            <span>Upload Audio File</span>
          </label>
        </div>

        <select
          className="stt-language-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={isProcessing || isRecording}
          title="Spoken language — pick the exact language for better accuracy than auto-detect"
        >
          {LANGUAGE_OPTIONS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <p style={{ textAlign: 'center', fontSize: '0.85rem', opacity: 0.6, marginTop: '-18px', marginBottom: '20px' }}>
        Maximum uploaded audio file size: {MAX_AUDIO_SIZE_MB}MB
      </p>

      {detectedLanguage && transcribedText && (
        <div className="stt-detected-language">Detected language: <strong>{detectedLanguage.toUpperCase()}</strong></div>
      )}

      <div className="stt-text-area-wrapper">
        <textarea
          className="stt-textarea"
          placeholder="Your transcribed text will appear here. You can also edit it before downloading."
          value={transcribedText}
          onChange={(e) => setTranscribedText(e.target.value)}
          disabled={isProcessing}
        />
        {isProcessing && (
          <div className="stt-processing-overlay">
            <div className="stt-spinner"></div>
            <span>Listening & Transcribing...</span>
          </div>
        )}
      </div>

      {transcribedText && (
        <div className="stt-download-actions stt-fade-in">
          <button className="stt-download-btn stt-download-btn--txt" onClick={() => handleDownload('txt')}>
            <FileText size={18} />
            <span>Download .txt</span>
          </button>
          <button className="stt-download-btn stt-download-btn--docx" onClick={() => handleDownload('docx')}>
            <FileIcon size={18} />
            <span>Download .docx</span>
          </button>
        </div>
      )}
      <ProcessingOverlay isVisible={isProcessing} text="Transcribing Audio..." />
    </div>
  );
};

export default SpeechToTextZone;
