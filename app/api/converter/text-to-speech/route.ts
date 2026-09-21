import { NextResponse } from 'next/server';
import { getUserEmailOrGuest } from '@/lib/auth/session';
import { generateStoredFilename, uploadAndSaveFile } from '@/lib/converter/saveFileRecord';
import { textToSpeech } from '@/lib/pythonService';
import { enforceConversionLimit } from '@/lib/rateLimit';
import { TTS_VOICE_IDS, TTS_SPEED_IDS, TTS_MAX_TEXT_LENGTH } from '@/lib/converter/ttsOptions';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_VOICE = TTS_VOICE_IDS[0];
const DEFAULT_SPEED = '+0%';

export async function POST(request: Request) {
  const limited = await enforceConversionLimit(request);
  if (limited) return limited;

  const body = await request.json();
  const { text, voice, speed } = body ?? {};

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ message: 'Text is required' }, { status: 400 });
  }

  if (text.length > TTS_MAX_TEXT_LENGTH) {
    return NextResponse.json({ message: `Text cannot exceed ${TTS_MAX_TEXT_LENGTH} characters.` }, { status: 400 });
  }

  if (voice !== undefined && !TTS_VOICE_IDS.includes(voice)) {
    return NextResponse.json({ message: 'Unsupported voice selected.' }, { status: 400 });
  }

  if (speed !== undefined && !TTS_SPEED_IDS.includes(speed)) {
    return NextResponse.json({ message: 'Unsupported speed selected.' }, { status: 400 });
  }

  const resolvedVoice = voice ?? DEFAULT_VOICE;
  const resolvedSpeed = speed ?? DEFAULT_SPEED;

  try {
    console.log(`Generating speech via Python microservice... Voice: ${resolvedVoice}, Speed: ${resolvedSpeed}`);
    const audioBuffer = await textToSpeech(text, resolvedVoice, resolvedSpeed);
    const filename = generateStoredFilename('speech.mp3', 'speech');

    const userEmail = await getUserEmailOrGuest(request);
    const newFile = await uploadAndSaveFile({
      buffer: audioBuffer,
      originalName: 'speech.mp3',
      filename,
      size: audioBuffer.length,
      mimetype: 'audio/mpeg',
      userEmail,
    });

    return NextResponse.json({
      message: 'Speech generated successfully',
      file: {
        _id: newFile._id,
        filename: newFile.filename,
        originalName: newFile.originalName,
        size: newFile.size,
        mimetype: newFile.mimetype,
      },
    });
  } catch (error) {
    console.error('Error generating speech:', error instanceof Error ? error.message : error);
    return NextResponse.json({ message: 'Failed to generate speech. Python service might be down.' }, { status: 400 });
  }
}
