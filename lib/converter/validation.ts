export class FileTooLargeError extends Error {}
export class InvalidFileTypeError extends Error {}

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

// Word/Excel/PowerPoint uploads (both legacy and OOXML) - these all get converted via
// LibreOffice in the Python microservice, which has no size limit of its own to fall
// back on, so this is the only gate before a huge file ties up that shared, serialized
// conversion path. Matches the 20MB default the client already assumes for these types
// (FileStagingZone.tsx, ToolPage.tsx) and the limit enforced again on the Python side
// (MAX_OFFICE_UPLOAD_BYTES in main.py) for anyone who reaches that service directly.
const OFFICE_MIMETYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export function assertFileSizeAllowed(mimetype: string, size: number): void {
  if (size === 0) {
    throw new FileTooLargeError('The selected file is empty.');
  }
  if (mimetype === 'application/pdf' && size > 10 * 1024 * 1024) {
    throw new FileTooLargeError('PDF files cannot exceed 10MB.');
  }
  if (mimetype.startsWith('image/') && size > 5 * 1024 * 1024) {
    throw new FileTooLargeError('Image files cannot exceed 5MB.');
  }
  if (mimetype.startsWith('audio/') && size > 5 * 1024 * 1024) {
    throw new FileTooLargeError('Audio files cannot exceed 5MB.');
  }
  if (OFFICE_MIMETYPES.has(mimetype) && size > 20 * 1024 * 1024) {
    throw new FileTooLargeError('Word, Excel, and PowerPoint files cannot exceed 20MB.');
  }
  // txt-to-pdf (processFile.ts's textToPdfBuffer) renders the whole file through pdfkit
  // synchronously - unlike every other type above, this had no cap at all, so a file bigger
  // than the client's own 20MB assumption (ToolPage.tsx) could still reach here directly.
  // Matches that existing client-side number rather than introducing a new one.
  if (mimetype === 'text/plain' && size > 20 * 1024 * 1024) {
    throw new FileTooLargeError('Text files cannot exceed 20MB.');
  }
}

// Permissive allow-list: only rejects a *known* mimetype paired with a clearly
// mismatched extension (e.g. "image/png" saved as "report.pdf"). Mimetypes we
// don't recognize are let through rather than blocked, so legitimate uploads
// of types outside this list are never incorrectly rejected.
const MIMETYPE_EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg', 'jfif'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/svg+xml': ['svg'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
  'image/bmp': ['bmp'],
  'image/tiff': ['tif', 'tiff'],
  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'audio/x-wav': ['wav'],
  'audio/ogg': ['ogg'],
  'audio/webm': ['webm'],
  'audio/mp4': ['m4a', 'mp4'],
  'audio/aac': ['aac'],
  'audio/flac': ['flac'],
  'text/plain': ['txt'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/zip': ['zip'],
};

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex === -1 ? '' : filename.slice(dotIndex + 1).toLowerCase();
}

export function assertExtensionMatchesMimetype(filename: string, mimetype: string): void {
  const cleanMimetype = mimetype.split(';')[0].trim().toLowerCase();
  const allowedExtensions = MIMETYPE_EXTENSIONS[cleanMimetype];
  if (!allowedExtensions) return; // unrecognized mimetype, don't block it

  const extension = getExtension(filename);
  if (!extension || !allowedExtensions.includes(extension)) {
    throw new InvalidFileTypeError(
      `File extension ".${extension || '?'}" does not match the file's content type (${cleanMimetype}).`
    );
  }
}
