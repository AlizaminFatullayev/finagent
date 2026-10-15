/** The backend error envelope: `{ error: { code, message, details, requestId } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
    readonly requestId: string | null = null,
    /** Seconds from the `Retry-After` header of a 429, when the server sent one. */
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Envelope = { error?: { code?: unknown; message?: unknown; details?: unknown; requestId?: unknown } };

export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/** Builds an ApiError from a failed response and its (possibly missing) JSON body. */
export function toApiError(response: Response, body: unknown): ApiError {
  const err = (body as Envelope | null)?.error;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return new ApiError(
    response.status,
    str(err?.code) ?? (response.status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR'),
    str(err?.message) ?? 'The request failed',
    err?.details ?? null,
    str(err?.requestId) ?? response.headers.get('x-request-id'),
    response.status === 429 ? parseRetryAfter(response.headers.get('retry-after')) : null,
  );
}

/** Field errors from a 422 `VALIDATION_ERROR`: `details` is `[{ path, message }]`. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.status !== 422 || !Array.isArray(error.details)) return {};
  const out: Record<string, string> = {};
  for (const d of error.details as { path?: unknown; message?: unknown }[]) {
    if (typeof d.path === 'string' && typeof d.message === 'string' && !(d.path in out))
      out[d.path] = d.message;
  }
  return out;
}

export const isApiError = (e: unknown, status?: number): e is ApiError =>
  e instanceof ApiError && (status === undefined || e.status === status);
