import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { envelope, pair } from '../test/fixtures';
import { AuthProvider, useAuth } from './AuthProvider';
import { getAccessToken, getRefreshToken, setSession } from './session';

let loggedOut: unknown = null;
const server = setupServer(
  http.post('*/api/auth/refresh', () => HttpResponse.json(envelope(pair(2)))),
  http.post('*/api/auth/logout', async ({ request }) => {
    loggedOut = await request.json();
    return HttpResponse.json(envelope({ loggedOut: true }));
  }),
);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

describe('logout', () => {
  it('revokes the session on the server and clears tokens, cache and user', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['files'], { rows: ['[PERSON_1]'] });
    setSession(pair(1));
    let auth: ReturnType<typeof useAuth> | null = null;
    const Probe = () => {
      auth = useAuth();
      return null;
    };
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(auth!.status).toBe('authenticated'));
    await act(() => auth!.logout());
    expect(loggedOut).toEqual({ refreshToken: pair(2).refreshToken });
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(auth!.status).toBe('anonymous');
    expect(auth!.user).toBeNull();
  });
});
