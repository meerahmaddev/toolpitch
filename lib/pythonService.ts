import axios from 'axios';
import FormData from 'form-data';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8001';

// Shared secret between this app and the Python microservice. Without it, anyone
// who can reach PYTHON_SERVICE_URL directly (misconfigured firewall/network) can
// hit conversion endpoints for free, bypassing enforceConversionLimit() entirely
// since that check only runs in the Next.js route handlers. Optional so local dev
// keeps working without setting it - the Python side skips the check the same way
// when its own copy of the env var is unset, so both sides stay in sync by default.
const PYTHON_SERVICE_SECRET = process.env.PYTHON_SERVICE_SECRET;

const client = axios.create({
  baseURL: PYTHON_SERVICE_URL,
  headers: PYTHON_SERVICE_SECRET ? { Authorization: `Bearer ${PYTHON_SERVICE_SECRET}` } : undefined,
});

// Complex PDFs and Office files can take longer than a minute on the local Windows service,
// especially on the first LibreOffice/UNO request. Keep enough time for that work to finish
// before Axios gives up.
const CONVERSION_TIMEOUT_MS = 300000;

// The Python microservice runs LibreOffice (word/excel/ppt <-> pdf) and Ghostscript
// (compress-pdf, thumbnails) on a persistent Linux host, since neither fits Vercel's
// serverless function constraints. Any failure to reach it - down, still deploying,
// wrong PYTHON_SERVICE_URL - is surfaced as this single, user-safe error type so route
// handlers can return a clean "temporarily unavailable" response instead of leaking
// axios/connection internals to the client.
export class ConversionServiceError extends Error {
  constructor(message = 'The conversion service is temporarily unavailable. Please try again shortly.') {
    super(message);
    this.name = 'ConversionServiceError';
  }
}

// Thrown when the Python service rejects the upload itself - corrupted, empty,
// password-protected, or not actually the format its extension claims - as opposed
// to a service-side problem (down, still deploying, wrong URL). Kept distinct from
// ConversionServiceError so the caller can tell the user to fix/replace their file
// instead of just "try again shortly", which is actively wrong advice when retrying
// the same broken file will only fail the same way every time.
export class InvalidFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFileError';
  }
}

// The Python service reports a bad-input file as 422 with a plain-text JSON body
// ({"detail": "..."}), even though every conversion call here uses responseType:
// 'arraybuffer' - so on error, response.data arrives as a Buffer of that JSON text
// rather than real file bytes, and has to be parsed back out.
function extractErrorDetail(error: import('axios').AxiosError): string | undefined {
  const data = error.response?.data;
  if (!data) return undefined;
  try {
    const text = data instanceof Buffer ? data.toString('utf-8') : typeof data === 'string' ? data : JSON.stringify(data);
    const parsed = JSON.parse(text);
    return typeof parsed?.detail === 'string' ? parsed.detail : undefined;
  } catch {
    return undefined;
  }
}

function rethrowAsServiceError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const detail = extractErrorDetail(error);
    console.error('Python service error:', error.message, detail ?? '');
    if (error.response?.status === 422 && detail) {
      throw new InvalidFileError(detail);
    }
  } else {
    console.error('Python service error:', error);
  }
  throw new ConversionServiceError();
}

async function postFile(endpoint: string, buffer: Buffer, filename: string, fields?: Record<string, string>): Promise<Buffer> {
  const formData = new FormData();
  formData.append('file', buffer, { filename });
  for (const [key, value] of Object.entries(fields ?? {})) {
    formData.append(key, value);
  }

  try {
    const response = await client.post(endpoint, formData, {
      headers: formData.getHeaders(),
      responseType: 'arraybuffer',
      timeout: CONVERSION_TIMEOUT_MS,
    });
    return Buffer.from(response.data);
  } catch (error) {
    rethrowAsServiceError(error);
  }
}

export async function pdfToWord(buffer: Buffer, filename: string): Promise<{ buffer: Buffer; method: string }> {
  const formData = new FormData();
  formData.append('file', buffer, { filename });

  try {
    const response = await client.post('/convert/pdf-to-word', formData, {
      headers: formData.getHeaders(),
      responseType: 'arraybuffer',
      timeout: CONVERSION_TIMEOUT_MS,
    });
    return {
      buffer: Buffer.from(response.data),
      method: response.headers['x-conversion-method'] || 'layout-mode',
    };
  } catch (error) {
    rethrowAsServiceError(error);
  }
}

export async function pdfToExcel(buffer: Buffer, filename: string): Promise<Buffer> {
  return postFile('/convert/pdf-to-excel', buffer, filename);
}

export async function pdfToPpt(buffer: Buffer, filename: string): Promise<Buffer> {
  return postFile('/convert/pdf-to-ppt', buffer, filename);
}

export async function pdfToImages(buffer: Buffer, filename: string): Promise<Buffer> {
  return postFile('/convert/pdf-to-images', buffer, filename);
}

export async function wordToPdf(buffer: Buffer, filename: string): Promise<Buffer> {
  return postFile('/convert/word-to-pdf', buffer, filename);
}

export async function excelToPdf(buffer: Buffer, filename: string): Promise<Buffer> {
  return postFile('/convert/excel-to-pdf', buffer, filename);
}

export async function pptToPdf(buffer: Buffer, filename: string): Promise<Buffer> {
  return postFile('/convert/ppt-to-pdf', buffer, filename);
}

export interface CompressResult {
  buffer: Buffer;
  beforeSize: number;
  afterSize: number;
}

export async function compressPdf(buffer: Buffer, filename: string, level: string): Promise<CompressResult> {
  const formData = new FormData();
  formData.append('file', buffer, { filename });
  formData.append('level', level);

  try {
    const response = await client.post('/convert/compress-pdf', formData, {
      headers: formData.getHeaders(),
      responseType: 'arraybuffer',
      timeout: CONVERSION_TIMEOUT_MS,
    });
    return {
      buffer: Buffer.from(response.data),
      beforeSize: Number(response.headers['x-before-size'] || 0),
      afterSize: Number(response.headers['x-after-size'] || 0),
    };
  } catch (error) {
    rethrowAsServiceError(error);
  }
}

export async function pdfThumbnail(buffer: Buffer, filename: string): Promise<Buffer> {
  return postFile('/convert/pdf-thumbnail', buffer, filename);
}

export async function officeThumbnail(buffer: Buffer, filename: string): Promise<Buffer> {
  return postFile('/convert/office-thumbnail', buffer, filename);
}

export async function textToSpeech(text: string, voice: string, speed: string): Promise<Buffer> {
  try {
    const response = await client.post(
      '/convert/text-to-speech',
      { text, voice, speed },
      { responseType: 'arraybuffer', timeout: 55000 }
    );
    return Buffer.from(response.data);
  } catch (error) {
    rethrowAsServiceError(error);
  }
}

export async function speechToText(
  buffer: Buffer,
  filename: string,
  mimetype: string,
  language?: string
): Promise<{ text: string; language: string }> {
  const formData = new FormData();
  formData.append('file', buffer, { filename: filename || 'audio.webm', contentType: mimetype || 'audio/webm' });
  if (language) formData.append('language', language);

  try {
    const response = await client.post('/convert/speech-to-text', formData, {
      headers: formData.getHeaders(),
      timeout: 55000,
    });

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    return { text: response.data.text, language: response.data.language };
  } catch (error) {
    if (error instanceof Error && !axios.isAxiosError(error)) throw error;
    rethrowAsServiceError(error);
  }
}
