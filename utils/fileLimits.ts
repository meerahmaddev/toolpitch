// Client-side mirror of the limits enforced server-side in lib/converter/validation.ts
// (assertFileSizeAllowed) and, for compress/thumbnail endpoints, python_service/main.py.
// Keep these two in sync - this file exists so every upload zone shows and checks the
// same number instead of each component hardcoding (and inevitably drifting from) its
// own copy.
export const FILE_SIZE_LIMITS_MB = {
  pdf: 10,
  image: 5,
  audio: 5,
  office: 20,
  text: 20,
} as const;

export type FileSizeCategory = keyof typeof FILE_SIZE_LIMITS_MB;

export const FILE_SIZE_LIMIT_BYTES: Record<FileSizeCategory, number> = {
  pdf: FILE_SIZE_LIMITS_MB.pdf * 1024 * 1024,
  image: FILE_SIZE_LIMITS_MB.image * 1024 * 1024,
  audio: FILE_SIZE_LIMITS_MB.audio * 1024 * 1024,
  office: FILE_SIZE_LIMITS_MB.office * 1024 * 1024,
  text: FILE_SIZE_LIMITS_MB.text * 1024 * 1024,
};

const OFFICE_MIMETYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

// Best-effort category guess from a mimetype, for the generic multi-format drop zone
// (ToolPage.tsx) where the accepted type isn't known until a file is actually picked.
// Falls back to 'office' (the most permissive limit) for anything unrecognized rather
// than under-restricting to the tightest one.
export function categoryForMimetype(mimetype: string): FileSizeCategory {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype === 'text/plain') return 'text';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (OFFICE_MIMETYPES.has(mimetype)) return 'office';
  return 'office';
}
