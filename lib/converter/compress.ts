import * as pythonService from '@/lib/pythonService';

export interface CompressResult {
  buffer: Buffer;
  beforeSize: number;
  afterSize: number;
}

export async function compressPdf(inputBuffer: Buffer, level: string): Promise<CompressResult> {
  return pythonService.compressPdf(inputBuffer, 'input.pdf', level);
}
