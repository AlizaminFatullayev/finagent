import { API_BASE, getAccessToken, refreshSession } from '../auth/session';
import { toApiError } from './errors';
import type { FileItem } from './types';

export type UploadResult = { file: FileItem; deduplicated: boolean };
export type UploadProgress = { loaded: number; total: number };

function send(file: File, onProgress: (p: UploadProgress) => void, signal?: AbortSignal) {
  return new Promise<{ status: number; body: unknown; headers: Headers }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/files`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress({ loaded: e.loaded, total: e.total });
    xhr.onload = () => {
      const headers = new Headers();
      for (const line of xhr.getAllResponseHeaders().trim().split(/\r?\n/)) {
        const i = line.indexOf(':');
        if (i > 0) headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
      }
      resolve({ status: xhr.status, body: xhr.response, headers });
    };
    xhr.onerror = () => reject(new TypeError('Network error'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

/**
 * Uploads one workbook with progress. XMLHttpRequest because fetch cannot report upload progress.
 * 200 = identical file already uploaded (`deduplicated`), 202 = queued for parsing. A 401 triggers
 * one token refresh and one retry, like every other API call.
 */
export async function uploadFile(
  file: File,
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  let res = await send(file, onProgress, signal);
  if (res.status === 401 && (await refreshSession())) res = await send(file, onProgress, signal);
  if (res.status === 200 || res.status === 202) {
    const body = res.body as { data: FileItem; meta: { deduplicated: boolean } };
    return { file: body.data, deduplicated: body.meta.deduplicated };
  }
  throw toApiError(new Response(null, { status: res.status, headers: res.headers }), res.body);
}
