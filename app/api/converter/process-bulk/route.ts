import { NextResponse } from 'next/server';
import { getUserEmailOrGuest } from '@/lib/auth/session';
import { assertFileSizeAllowed, assertExtensionMatchesMimetype, FileTooLargeError, InvalidFileTypeError } from '@/lib/converter/validation';
import { generateStoredFilename, uploadAndSaveFile } from '@/lib/converter/saveFileRecord';
import { processBulkFiles, AllFilesFailedError } from '@/lib/converter/processBulk';
import { enforceConversionLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await enforceConversionLimit(request);
  if (limited) return limited;

  const formData = await request.formData();
  const rawFiles = formData.getAll('files').filter((f): f is File => f instanceof File);
  const toolId = formData.get('toolId');

  if (rawFiles.length === 0) {
    return NextResponse.json({ message: 'No files uploaded.' }, { status: 400 });
  }
  if (typeof toolId !== 'string' || !toolId) {
    return NextResponse.json({ message: 'toolId is required' }, { status: 400 });
  }

  let totalSize = 0;
  for (const file of rawFiles) {
    totalSize += file.size;
    try {
      assertFileSizeAllowed(file.type, file.size);
      assertExtensionMatchesMimetype(file.name, file.type);
    } catch (error) {
      if (error instanceof FileTooLargeError || error instanceof InvalidFileTypeError) {
        return NextResponse.json({ message: error.message }, { status: 400 });
      }
      throw error;
    }
  }
  if (totalSize > 25 * 1024 * 1024) {
    return NextResponse.json(
      { message: 'Total batch size cannot exceed 25MB. Please reduce the number of files.' },
      { status: 400 }
    );
  }

  const userEmail = await getUserEmailOrGuest(request);
  const files = await Promise.all(
    rawFiles.map(async (f) => ({ buffer: Buffer.from(await f.arrayBuffer()), originalName: f.name }))
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      try {
        sendEvent({
          type: 'progress',
          stage: 'start',
          current: 0,
          total: files.length,
          message: `Preparing ${files.length} files for conversion...`,
        });

        const processed = await processBulkFiles(files, toolId, (current, total, fileName) => {
          sendEvent({
            type: 'progress',
            stage: 'converting',
            current,
            total,
            fileName,
            message: `Converting file ${current} of ${total} (${fileName})...`,
          });
        });

        sendEvent({
          type: 'progress',
          stage: 'zipping',
          current: files.length,
          total: files.length,
          message: 'Packaging converted files into ZIP archive...',
        });

        const filename = generateStoredFilename(processed.cleanName, 'bulk');

        sendEvent({
          type: 'progress',
          stage: 'saving',
          current: files.length,
          total: files.length,
          message: 'Saving and finalizing download...',
        });

        const newFile = await uploadAndSaveFile({
          buffer: processed.buffer,
          originalName: processed.cleanName,
          filename,
          size: processed.buffer.length,
          mimetype: processed.mimetype,
          userEmail,
        });

        sendEvent({
          type: 'complete',
          data: {
            message:
              processed.errors.length > 0 ? 'Bulk processing completed with partial errors' : 'Bulk processing successful',
            file: {
              _id: newFile._id,
              filename: newFile.filename,
              originalName: newFile.originalName,
              size: newFile.size,
              mimetype: newFile.mimetype,
            },
            errors: processed.errors,
            successCount: rawFiles.length - processed.errors.length,
            failureCount: processed.errors.length,
          },
        });
      } catch (error) {
        if (error instanceof AllFilesFailedError) {
          sendEvent({ type: 'error', message: error.message });
        } else {
          const detail = error instanceof Error ? error.message : 'Bulk processing failed';
          sendEvent({ type: 'error', message: detail });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Transfer-Encoding': 'chunked',
    },
  });
}
