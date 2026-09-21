'use client';

import { useState, useRef } from 'react';
import { Mic, UploadCloud, PlayCircle, Loader2 } from 'lucide-react';
import { message } from '@/utils/message';
import { TTS_VOICE_GROUPS as voiceGroups, TTS_SPEEDS as speeds, TTS_MAX_TEXT_LENGTH } from '@/lib/converter/ttsOptions';
import ProcessingOverlay from './ProcessingOverlay';
import './TextToSpeechZone.css';

const voices = voiceGroups.flatMap((g) => g.voices);

interface TextToSpeechZoneProps {
  onConvert: (text: string, voice: string, speed: string) => Promise<void>;
}

const TextToSpeechZone = ({ onConvert }: TextToSpeechZoneProps) => {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState(voices[0].id);
  const [speed, setSpeed] = useState(speeds[2].id);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const playClick = () => window.soundManager?.playClick();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/plain') {
      message.error('Please upload a valid .txt file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setText(event.target?.result as string);
      message.success('Text loaded successfully!');
    };
    reader.onerror = () => {
      message.error('Failed to read file');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConvert = async () => {
    if (!text.trim()) {
      message.warning('Please enter some text to convert!');
      return;
    }

    if (text.length > TTS_MAX_TEXT_LENGTH) {
      message.warning(`Text is too long. Maximum ${TTS_MAX_TEXT_LENGTH} characters allowed per request.`);
      return;
    }

    playClick();
    setIsProcessing(true);
    try {
      await onConvert(text, voice, speed);
    } catch {
      // Error handled by parent
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="tts-zone fade-in">
      <div className="tts-header">
        <Mic className="tts-icon" size={28} />
        <h2>Text to Speech</h2>
      </div>

      <div className="tts-body">
        <textarea
          className="tts-textarea"
          placeholder="Type or paste your text here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isProcessing}
        />
        <div className="tts-char-count">{text.length} / {TTS_MAX_TEXT_LENGTH} characters</div>

        <div className="tts-controls">
          <div className="tts-control-group">
            <label>Voice / Accent</label>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={isProcessing}>
              {voiceGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="tts-control-group">
            <label>Speaking Speed</label>
            <select value={speed} onChange={(e) => setSpeed(e.target.value)} disabled={isProcessing}>
              {speeds.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="tts-actions">
          <button
            className="tts-upload-btn"
            onClick={() => {
              playClick();
              fileInputRef.current?.click();
            }}
            disabled={isProcessing}
          >
            <UploadCloud size={18} /> Upload .txt File
          </button>

          <button className="tts-convert-btn" onClick={handleConvert} disabled={isProcessing || !text.trim()}>
            {isProcessing ? <Loader2 className="spinner" size={20} /> : <PlayCircle size={20} />}
            {isProcessing ? 'Generating...' : 'Convert to Audio'}
          </button>

          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".txt" onChange={handleFileUpload} />
        </div>
      </div>
      <ProcessingOverlay isVisible={isProcessing} text="Generating Speech..." />
    </div>
  );
};

export default TextToSpeechZone;
