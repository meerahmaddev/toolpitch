import * as pythonService from '@/lib/pythonService';

export async function generatePdfThumbnail(inputBuffer: Buffer): Promise<Buffer> {
  return pythonService.pdfThumbnail(inputBuffer, 'document.pdf');
}
