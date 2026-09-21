// Next.js router navigation doesn't support React Router's `navigate(path, { state })`.
// This sessionStorage handoff replicates passing the converted file to the /success page.
const KEY = 'convertify_success_file';

export interface HandoffFile {
  _id: string;
  filename: string;
  originalName: string;
  [key: string]: unknown;
}

export function setSuccessFile(file: HandoffFile) {
  sessionStorage.setItem(KEY, JSON.stringify(file));
}

// Non-destructive: React Strict Mode double-invokes mount effects in dev, so a read that
// deletes on first call would find nothing on the second call and bounce the page away.
// sessionStorage is per-tab and gets overwritten by the next setSuccessFile() anyway, so
// there's no real need to clear it eagerly.
export function getAndClearSuccessFile(): HandoffFile | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
