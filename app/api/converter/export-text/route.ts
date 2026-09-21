import { NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun } from 'docx';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json();
  const { text, format } = body ?? {};

  if (!text) {
    return NextResponse.json({ message: 'Text is required' }, { status: 400 });
  }

  if (format === 'docx') {
    const doc = new Document({
      sections: [{ properties: {}, children: [new Paragraph({ children: [new TextRun(text)] })] }],
    });
    const buffer = await Packer.toBuffer(doc);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="transcription.docx"',
        'Content-Length': String(buffer.length),
      },
    });
  }

  const buffer = Buffer.from(text, 'utf-8');
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': 'attachment; filename="transcription.txt"',
      'Content-Length': String(buffer.length),
    },
  });
}
