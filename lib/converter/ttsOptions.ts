// Single source of truth for text-to-speech voice/speed choices - shared between the
// UI (TextToSpeechZone.tsx, so the dropdowns stay in sync with what's actually valid)
// and the API route (so a request sent directly to the API, bypassing the UI, can't
// pass an arbitrary voice/speed string through to the Python microservice).

export const TTS_VOICE_GROUPS = [
  {
    label: 'English',
    voices: [
      { id: 'en-US-JennyNeural', label: 'Jenny (US Female)' },
      { id: 'en-US-GuyNeural', label: 'Guy (US Male)' },
      { id: 'en-GB-SoniaNeural', label: 'Sonia (UK Female)' },
      { id: 'en-GB-RyanNeural', label: 'Ryan (UK Male)' },
      { id: 'en-AU-NatashaNeural', label: 'Natasha (AU Female)' },
      { id: 'en-AU-WilliamNeural', label: 'William (AU Male)' },
    ],
  },
  {
    label: 'Urdu',
    voices: [
      { id: 'ur-PK-UzmaNeural', label: 'Uzma (Female)' },
      { id: 'ur-PK-AsadNeural', label: 'Asad (Male)' },
    ],
  },
  {
    label: 'Hindi',
    voices: [
      { id: 'hi-IN-SwaraNeural', label: 'Swara (Female)' },
      { id: 'hi-IN-MadhurNeural', label: 'Madhur (Male)' },
    ],
  },
  {
    label: 'Arabic',
    voices: [
      { id: 'ar-SA-ZariyahNeural', label: 'Zariyah (Female)' },
      { id: 'ar-SA-HamedNeural', label: 'Hamed (Male)' },
    ],
  },
  {
    label: 'Spanish',
    voices: [
      { id: 'es-ES-ElviraNeural', label: 'Elvira (Female)' },
      { id: 'es-ES-AlvaroNeural', label: 'Alvaro (Male)' },
    ],
  },
  {
    label: 'French',
    voices: [
      { id: 'fr-FR-DeniseNeural', label: 'Denise (Female)' },
      { id: 'fr-FR-HenriNeural', label: 'Henri (Male)' },
    ],
  },
];

export const TTS_VOICES = TTS_VOICE_GROUPS.flatMap((g) => g.voices);
export const TTS_VOICE_IDS = TTS_VOICES.map((v) => v.id);

export const TTS_SPEEDS = [
  { id: '-50%', label: '0.5x' },
  { id: '-25%', label: '0.75x' },
  { id: '+0%', label: '1.0x (Normal)' },
  { id: '+25%', label: '1.25x' },
  { id: '+50%', label: '1.5x' },
  { id: '+100%', label: '2.0x' },
];

export const TTS_SPEED_IDS = TTS_SPEEDS.map((s) => s.id);

export const TTS_MAX_TEXT_LENGTH = 5000;
