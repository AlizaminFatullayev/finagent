import { authFetch, API_BASE } from '../auth/session';
import { toApiError } from './errors';

/** Filename from `Content-Disposition: attachment; filename="..."` (RFC 6266, incl. filename*). */
export function filenameFrom(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // fall through to the plain parameter
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  return plain?.[1]?.trim() || fallback;
}

/** Fetches an authenticated file as a blob. */
export async function fetchBlob(path: string, fallbackName: string) {
  const res = await authFetch(new Request(`${API_BASE}${path}`));
  if (!res.ok) throw toApiError(res, await res.json().catch(() => null));
  return {
    blob: await res.blob(),
    filename: filenameFrom(res.headers.get('content-disposition'), fallbackName),
  };
}

/** Saves a blob through a temporary object URL, revoked right after the click. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
