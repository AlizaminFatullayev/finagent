import { toApiError } from '../api/errors';
import type { TokenPair } from '../api/types';

/**
 * Token storage. The access token lives only in this module's memory. The refresh token is kept in
 * sessionStorage so a reload in the same tab survives; the API returns it in the JSON body, so an
 * httpOnly cookie would need a backend change (see docs/API_GAPS.md).
 */
const REFRESH_KEY = 'finagent.refresh';

export type SessionEvent = 'refreshed' | 'expired' | 'cleared';

let accessToken: string | null = null;
let refreshing: Promise<TokenPair | null> | null = null;
const listeners = new Set<(event: SessionEvent, pair?: TokenPair) => void>();

export const API_BASE: string = import.meta.env.VITE_API_URL || window.location.origin;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const getAccessToken = () => accessToken;
export const getRefreshToken = () => storage()?.getItem(REFRESH_KEY) ?? null;

export function onSession(listener: (event: SessionEvent, pair?: TokenPair) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
const emit = (event: SessionEvent, pair?: TokenPair) => listeners.forEach((l) => l(event, pair));

export function setSession(pair: TokenPair) {
  accessToken = pair.accessToken;
  try {
    storage()?.setItem(REFRESH_KEY, pair.refreshToken);
  } catch {
    // Storage full or blocked: the session still works until the tab is reloaded.
  }
  emit('refreshed', pair);
}

export function clearSession(event: Extract<SessionEvent, 'expired' | 'cleared'> = 'cleared') {
  const had = accessToken !== null || getRefreshToken() !== null;
  accessToken = null;
  storage()?.removeItem(REFRESH_KEY);
  if (had || event === 'cleared') emit(event);
}

/**
 * Exchanges the refresh token for a new pair. Single-flight: concurrent callers share one request,
 * because refresh tokens are single-use and a second parallel refresh would be treated as reuse.
 * Resolves to null when the session is gone (and emits `expired`); throws on network errors and 429s
 * so the caller can show them without logging the user out.
 */
export function refreshSession(): Promise<TokenPair | null> {
  refreshing ??= (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (res.ok) {
      const pair = ((await res.json()) as { data: TokenPair }).data;
      setSession(pair);
      return pair;
    }
    if (res.status === 401 || res.status === 422) {
      clearSession('expired');
      return null;
    }
    throw toApiError(res, await res.json().catch(() => null));
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

const isAuthCall = (url: string) => /\/api\/auth\/(login|refresh|logout)$/.test(new URL(url).pathname);

function send(request: Request) {
  if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(request);
}

/** fetch for the typed client: adds the bearer token and retries once after a refresh on 401. */
export async function authFetch(request: Request): Promise<Response> {
  const retry = request.clone();
  const response = await send(request);
  if (response.status !== 401 || isAuthCall(request.url)) return response;
  const pair = await refreshSession();
  if (!pair) {
    clearSession('expired');
    return response;
  }
  return send(retry);
}
