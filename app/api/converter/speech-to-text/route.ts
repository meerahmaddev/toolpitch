import { NextResponse } from 'next/server';
import { speechToText } from '@/lib/pythonService';
import { assertFileSizeAllowed, FileTooLargeError } from '@/lib/converter/validation';
import { enforceConversionLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await enforceConversionLimit(request);
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get('file');
  const language = formData.get('language');

  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'Audio file is required' }, { status: 400 });
  }
  // This endpoint only ever handles audio, so enforce the 5MB audio cap even
  // if the browser sent an unrecognized/empty mimetype (assertFileSizeAllowed
  // only checks known audio/* types and would otherwise let those through).
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ message: 'Audio files cannot exceed 5MB.' }, { status: 400 });
  }
  try {
    assertFileSizeAllowed(file.type, file.size);
  } catch (error) {
    if (error instanceof FileTooLargeError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    console.log('Transcribing audio via Python microservice...');
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await speechToText(buffer, file.name, file.type, typeof language === 'string' ? language : undefined);

    return NextResponse.json({
      message: 'Speech transcribed successfully',
      text: result.text,
      language: result.language,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error transcribing speech:', message);
    return NextResponse.json({ message: `Failed to transcribe speech: ${message}` }, { status: 400 });
  }
}
