import { ZipArchive } from 'archiver';
import { PassThrough } from 'stream';
import { processFile, type ProcessedFile } from '@/lib/converter/processFile';

export class AllFilesFailedError extends Error {
  constructor() {
    super('All files failed to convert.');
  }
}

export interface BulkProcessedFile {
  buffer: Buffer;
  cleanName: string;
  mimetype: string;
  ext: string;
  errors: { fileName: string; reason: string }[];
}

export type BulkProgressCallback = (current: number, total: number, fileName: string) => void;

function getZipFileName(toolId: string): string {
  if (!toolId || toolId === 'default') {
    return 'Bulk-Converted-Files.zip';
  }
  const cleanToolId = toolId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `Bulk-Converted-${cleanToolId}.zip`;
}

export async function processBulkFiles(
  files: { buffer: Buffer; originalName: string }[],
  toolId: string,
  onProgress?: BulkProgressCallback
): Promise<BulkProcessedFile> {
  const processedFiles: ProcessedFile[] = [];
  const errors: { fileName: string; reason: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) {
      onProgress(i + 1, files.length, file.originalName);
    }
    try {
      const processed = await processFile(file.buffer, file.originalName, toolId);
      processedFiles.push(processed);
    } catch (err) {
      errors.push({
        fileName: file.originalName,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (processedFiles.length === 0) {
    throw new AllFilesFailedError();
  }

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const passthrough = new PassThrough();
    const chunks: Buffer[] = [];

    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    archive.pipe(passthrough);

    // Guard against duplicate names across files in the batch.
    const usedNames = new Set<string>();
    for (const processed of processedFiles) {
      let name = processed.cleanName;
      let i = 1;
      while (usedNames.has(name)) {
        name = `${processed.cleanName.replace(processed.ext, '')}(${i})${processed.ext}`;
        i++;
      }
      usedNames.add(name);
      archive.append(processed.buffer, { name });
    }

    archive.finalize();
  });

  const cleanName = getZipFileName(toolId);

  return {
    buffer,
    cleanName,
    mimetype: 'application/zip',
    ext: '.zip',
    errors,
  };
}

// Backward-compatible alias for any legacy imports
export const processBulkImages = processBulkFiles;
