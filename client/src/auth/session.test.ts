import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { api, unwrap } from '../api/client';
import { envelope, pair } from '../test/fixtures';
import { clearSession, getAccessToken, getRefreshToken, onSession, setSession } from './session';

let refreshCalls = 0;
const server = setupServer(
  http.post('*/api/auth/refresh', async ({ request }) => {
    refreshCalls += 1;
    const { refreshToken } = (await request.json()) as { refreshToken: string };
    if (refreshToken !== pair(1).refreshToken)
      return HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
    // Slow enough that concurrent 401s all arrive while the refresh is in flight.
    await new Promise((r) => setTimeout(r, 30));
    return HttpResponse.json(envelope(pair(2)));
  }),
  http.get('*/api/files', ({ request }) =>
    request.headers.get('Authorization') === 'Bearer access-2'
      ? HttpResponse.json(envelope([], { nextCursor: null }))
      : HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'expired', requestId: 'r' } },
          { status: 401 },
        ),
  ),
);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  refreshCalls = 0;
  clearSession();
});
afterAll(() => server.close());

describe('authFetch', () => {
  it('refreshes once for concurrent 401s and retries every request with the new token', async () => {
    setSession(pair(1));
    const results = await Promise.all([1, 2, 3, 4].map(() => unwrap(api.GET('/api/files'))));
    expect(results).toEqual([[], [], [], []]);
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBe('access-2');
    expect(getRefreshToken()).toBe(pair(2).refreshToken);
  });

  it('ends the session as expired when the refresh token is rejected', async () => {
    setSession({ ...pair(9), refreshToken: 'refresh-token-revoked-xxxxxxxxxxx' });
    const events: string[] = [];
    const off = onSession((e) => events.push(e));
    await expect(unwrap(api.GET('/api/files'))).rejects.toMatchObject({ status: 401 });
    off();
    expect(events).toContain('expired');
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('keeps the access token out of web storage', () => {
    setSession(pair(1));
    const stored = [
      ...Object.values({ ...window.sessionStorage }),
      ...Object.values({ ...window.localStorage }),
    ];
    expect(stored.join(' ')).not.toContain('access-1');
  });
});
