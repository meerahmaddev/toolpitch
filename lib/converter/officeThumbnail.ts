import * as pythonService from '@/lib/pythonService';

export async function generateOfficeThumbnail(inputBuffer: Buffer, inputExt: string): Promise<Buffer> {
  return pythonService.officeThumbnail(inputBuffer, `document${inputExt}`);
}
