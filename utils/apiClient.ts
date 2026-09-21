import { sanitizeError } from './errorHandler';

const API_URL = '/api';

// Global fetch interceptor for refresh tokens (client-side only)
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  let refreshPromise: Promise<string> | null = null;

  const refreshAccessToken = async (refreshToken: string): Promise<string> => {
    const refreshRes = await originalFetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshRes.ok) throw new Error('Refresh failed');

    const data = await refreshRes.json();
    localStorage.setItem('convertify_token', data.access_token);
    localStorage.setItem('convertify_refresh_token', data.refresh_token);
    return data.access_token;
  };

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    let response = await originalFetch(...args);

    if (response.status === 401) {
      const refreshToken = localStorage.getItem('convertify_refresh_token');
      if (refreshToken) {
        try {
          refreshPromise ??= refreshAccessToken(refreshToken).finally(() => {
            refreshPromise = null;
          });
          const accessToken = await refreshPromise;

          const [url, config] = args;
          const newHeaders = new Headers(config?.headers || {});
          newHeaders.set('Authorization', `Bearer ${accessToken}`);

          response = await originalFetch(url, { ...config, headers: newHeaders });
        } catch {
          localStorage.removeItem('convertify_token');
          localStorage.removeItem('convertify_refresh_token');
          localStorage.removeItem('convertify_active_user');
          window.dispatchEvent(new Event('auth_change'));
        }
      }
    }
    return response;
  };
}

export function authHeader(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('convertify_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function throwIfNotOk(response: Response, fallback: string) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(sanitizeError(errorData.message || fallback));
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const api = {
  async request(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(options.headers as Record<string, string> | undefined),
    };

    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(sanitizeError(data.message || 'Something went wrong'));
    }
    return data;
  },

  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/converter/upload`, {
      method: 'POST',
      headers: authHeader(),
      body: formData,
    });
    await throwIfNotOk(response, 'File upload failed');
    return response.json();
  },

  uploadFromUrl: async (url: string) => {
    const response = await fetch(`${API_URL}/converter/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ url }),
    });
    await throwIfNotOk(response, 'URL Upload failed');
    return response.json();
  },

  processFile: async (file: File, toolId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('toolId', toolId);

    const response = await fetch(`${API_URL}/converter/process`, {
      method: 'POST',
      headers: authHeader(),
      body: formData,
    });
    await throwIfNotOk(response, 'File processing failed');
    return response.json();
  },

  getUrlInfo: (url: string): Promise<{ contentType: string | null; extension: string | null }> =>
    api.request('/converter/url-info', { method: 'POST', body: JSON.stringify({ url }) }),

  processFromUrl: async (url: string, toolId = 'default') => {
    const response = await fetch(`${API_URL}/converter/process-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ url, toolId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(sanitizeError(data.message || 'Failed to download file'));
    return data;
  },

  processBulkFiles: async (
    files: File[],
    toolId: string,
    onProgress?: (info: {
      current?: number;
      total?: number;
      fileName?: string;
      stage?: string;
      message?: string;
      progressPercent?: number;
    }) => void
  ) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('toolId', toolId);

    const response = await fetch(`${API_URL}/converter/process-bulk`, {
      method: 'POST',
      headers: authHeader(),
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';

    // If server returned non-200 JSON directly (e.g. rate limit, file size error before stream)
    if (!response.ok && contentType.includes('application/json')) {
      const data = await response.json();
      throw new Error(sanitizeError(data.message || 'Bulk processing failed'));
    }

    if (contentType.includes('application/x-ndjson') && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let resultData: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === 'progress') {
              if (onProgress) {
                let percent: number | undefined;
                if (typeof event.current === 'number' && typeof event.total === 'number' && event.total > 0) {
                  percent = Math.min(Math.round((event.current / (event.total + 1)) * 100), 92);
                }
                onProgress({
                  current: event.current,
                  total: event.total,
                  fileName: event.fileName,
                  stage: event.stage,
                  message: event.message,
                  progressPercent: percent,
                });
              }
            } else if (event.type === 'complete') {
              resultData = event.data;
            } else if (event.type === 'error') {
              throw new Error(sanitizeError(event.message || 'Bulk processing failed'));
            }
          } catch (err) {
            if (err instanceof Error && (err.message.includes('failed') || err.message.includes('Failed') || err.message.includes('convert'))) {
              throw err;
            }
          }
        }
      }

      if (resultData) {
        if (onProgress) {
          onProgress({ current: files.length, total: files.length, progressPercent: 100, message: 'Complete!' });
        }
        return resultData;
      }
      throw new Error('No completion response received from server');
    }

    const data = await response.json();
    if (!response.ok) throw new Error(sanitizeError(data.message || 'Bulk processing failed'));
    return data;
  },

  mergePdfs: async (formData: FormData) => {
    const response = await fetch(`${API_URL}/converter/merge-pdf`, { method: 'POST', body: formData });
    await throwIfNotOk(response, 'Failed to merge PDFs');
    return { data: await response.blob() };
  },

  splitPdf: async (formData: FormData) => {
    const response = await fetch(`${API_URL}/converter/split-pdf`, { method: 'POST', body: formData });
    await throwIfNotOk(response, 'Failed to split PDF');
    return { data: await response.blob() };
  },

  editPdf: async (formData: FormData) => {
    const response = await fetch(`${API_URL}/converter/edit-pdf`, { method: 'POST', body: formData });
    await throwIfNotOk(response, 'Failed to save edited PDF');
    const overflowIds: string[] = JSON.parse(response.headers.get('X-Overflow-Blocks') || '[]');
    return { data: await response.blob(), overflowIds };
  },

  compressPdf: async (formData: FormData) => {
    const response = await fetch(`${API_URL}/converter/compress-pdf`, { method: 'POST', body: formData });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // The route's own errors use { error }, but the shared rate limiter
      // (enforceConversionLimit, checked before the route body runs) uses
      // { message } - checking only one field silently swallowed the other's
      // text and fell back to this generic message instead.
      throw new Error(errorData.error || errorData.message || 'Failed to compress PDF');
    }
    const blob = await response.blob();
    return {
      data: blob,
      beforeSize: Number(response.headers.get('X-Before-Size') || blob.size),
      afterSize: Number(response.headers.get('X-After-Size') || blob.size),
    };
  },

  textToSpeech: async (text: string, voice: string, speed: string) => {
    const response = await fetch(`${API_URL}/converter/text-to-speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed }),
    });
    await throwIfNotOk(response, 'Failed to generate speech');
    return response.json();
  },

  speechToText: async (audioFile: Blob, language?: string) => {
    const formData = new FormData();
    formData.append('file', audioFile);
    if (language) formData.append('language', language);

    const response = await fetch(`${API_URL}/converter/speech-to-text`, { method: 'POST', body: formData });
    await throwIfNotOk(response, 'Failed to transcribe speech');
    return response.json();
  },

  exportText: async (text: string, format: string) => {
    const response = await fetch(`${API_URL}/converter/export-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, format }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Export failed');
    }
    return response.blob();
  },

  editImage: async (file: File, config: object): Promise<{ blob: Blob; filename: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('config', JSON.stringify(config));

    const response = await fetch(`${API_URL}/converter/edit-image`, { method: 'POST', body: formData });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Image editing failed');
    }
    // The actual output format (and so its extension) can differ from the
    // uploaded file's - e.g. HEIC can't be re-encoded so it always comes back
    // as JPG. Read the real filename the server chose from Content-Disposition
    // instead of reusing the original file's name/extension.
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `compressed_${file.name}`;
    return { blob: await response.blob(), filename };
  },

  imagesToPdf: async (files: File[], options?: object) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (options) formData.append('options', JSON.stringify(options));

    const response = await fetch(`${API_URL}/converter/images-to-pdf`, { method: 'POST', body: formData });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'PDF generation failed');
    }
    return response.blob();
  },

  uploadFromDrive: async (fileId: string, filename: string, oauthToken: string, mimeType: string, toolId?: string) => {
    const body: Record<string, unknown> = { fileId, filename, oauthToken, mimeType };
    if (toolId) body.toolId = toolId;

    const response = await fetch(`${API_URL}/converter/upload-drive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(sanitizeError(data.message || 'Failed to download from Google Drive'));
    return data;
  },

  fetchDriveFileBlob: async (
    fileId: string,
    filename: string,
    oauthToken: string,
    mimeType: string
  ): Promise<{ blob: Blob; filename: string; mimeType: string }> => {
    const response = await fetch(`${API_URL}/converter/fetch-drive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ fileId, filename, oauthToken, mimeType }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(sanitizeError(errData.message || 'Failed to download file from Google Drive'));
    }

    const headerName = response.headers.get('X-File-Name');
    const headerMime = response.headers.get('X-File-Mime') || response.headers.get('Content-Type') || mimeType;
    const resolvedName = headerName ? decodeURIComponent(headerName) : filename;

    const blob = await response.blob();
    return { blob, filename: resolvedName, mimeType: headerMime };
  },

  getMyFiles: async () => {
    const response = await fetch(`${API_URL}/converter/my-files`, { method: 'GET', headers: authHeader() });
    await throwIfNotOk(response, 'Failed to fetch files');
    return response.json();
  },

  downloadFile: async (filename: string, originalName?: string) => {
    const response = await fetch(`${API_URL}/converter/download/${filename}`, { headers: authHeader() });
    await throwIfNotOk(response, 'Failed to download file');
    const blob = await response.blob();
    triggerBlobDownload(blob, originalName || filename);
    return true;
  },

  bulkDownloadFiles: async (ids: string[]) => {
    const response = await fetch(`${API_URL}/converter/bulk-download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ ids }),
    });
    await throwIfNotOk(response, 'Bulk download failed');
    const warnings = Number(response.headers.get('X-Bulk-Warnings') || 0);
    const blob = await response.blob();
    return { blob, warnings };
  },

  toggleFileState: async (id: string, updates: Record<string, unknown>) => {
    const response = await fetch(`${API_URL}/converter/file/${id}/toggle-state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update file state');
    return response.json();
  },

  performBulkAction: async (action: string, ids: string[], projectId: string | null = null) => {
    const body: Record<string, unknown> = { action, ids };
    if (projectId) body.projectId = projectId;

    const response = await fetch(`${API_URL}/converter/bulk-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Failed to perform bulk action: ${action}`);
    return response.json();
  },

  emptyTrash: async () => {
    const response = await fetch(`${API_URL}/converter/empty-trash`, {
      method: 'POST',
      headers: authHeader(),
    });
    if (!response.ok) throw new Error('Failed to empty trash');
    return response.json();
  },

  getProjects: async () => {
    const response = await fetch(`${API_URL}/converter/projects`, { method: 'GET', headers: authHeader() });
    if (!response.ok) throw new Error('Failed to fetch projects');
    return response.json();
  },

  createProject: async (name: string) => {
    const response = await fetch(`${API_URL}/converter/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Failed to create project');
    return response.json();
  },

  account: {
    updateProfile: (fullName: string) =>
      api.request('/account/profile', { method: 'PATCH', body: JSON.stringify({ fullName }) }),

    changePassword: (currentPassword: string, newPassword: string) =>
      api.request('/account/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) }),

    deleteAccount: () => api.request('/account', { method: 'DELETE' }),
  },

  auth: {
    signup: (email: string, password: string, fullName: string) =>
      api.request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, fullName }) }),

    login: (email: string, password: string) =>
      api.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

    verifyOtp: (email: string, code: string) =>
      api.request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, code }) }),

    checkOtp: (email: string, code: string) =>
      api.request('/auth/check-otp', { method: 'POST', body: JSON.stringify({ email, code }) }),

    forgotPassword: (email: string) =>
      api.request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),

    resetPassword: (email: string, code: string, newPassword: string) =>
      api.request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code, newPassword }) }),

    googleLogin: (token: string) => api.request('/auth/google', { method: 'POST', body: JSON.stringify({ token }) }),
  },
};
