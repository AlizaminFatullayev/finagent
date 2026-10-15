import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { envelope } from '../../test/fixtures';
import { RevealProvider } from './RevealProvider';
import { RevealBanner, TokenText } from './Token';

const SECRET = 'Synthetic Person Name';
let body: unknown = null;
const server = setupServer(
  http.post('*/api/files/:id/unmask', async ({ request }) => {
    body = await request.json();
    return HttpResponse.json(envelope({ values: { '[PERSON_3]': SECRET }, notFound: [] }));
  }),
);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => vi.useRealTimers());
afterAll(() => server.close());

describe('reveal flow', () => {
  it('reveals with a reason, shows the value inline, and re-masks after 60 s without storing it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <RevealProvider fileId="file-1">
          <p>
            <TokenText text="41 transfers from [PERSON_3] landed under the threshold." />
          </p>
          <RevealBanner />
        </RevealProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show [PERSON_3]' }));
    const reveal = screen.getByRole('button', { name: 'Reveal' });
    await user.type(screen.getByLabelText('Reason for revealing'), 'abc');
    expect(screen.getByText('Write at least 5 characters.')).toBeInTheDocument();
    expect(reveal).toBeDisabled();
    await user.type(screen.getByLabelText('Reason for revealing'), 'd case FIN-1');
    expect(screen.getByText('15/200')).toBeInTheDocument();
    await user.click(reveal);

    await screen.findByRole('heading', { name: '1 value revealed' });
    expect(body).toEqual({ tokens: ['[PERSON_3]'], reason: 'abcd case FIN-1' });
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/hide again in (1:00|0:59)/);

    // Nothing persistent holds the value: not web storage, not the query/mutation caches.
    const persisted = JSON.stringify([{ ...window.localStorage }, { ...window.sessionStorage }]);
    expect(persisted).not.toContain(SECRET);
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state.data),
      ),
    ).not.toContain(SECRET);

    act(() => void vi.advanceTimersByTime(59_000));
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1_100));
    await waitFor(() => expect(screen.queryByText(SECRET)).toBeNull());
    expect(screen.getByText('[PERSON_3]')).toBeInTheDocument();
    expect(screen.queryByText(/values? revealed/)).toBeNull();
  });

  it('drops revealed values when the page unmounts', async () => {
    const queryClient = new QueryClient();
    const user = userEvent.setup();
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <RevealProvider fileId="file-1">
          <TokenText text="[PERSON_3]" />
        </RevealProvider>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Show [PERSON_3]' }));
    await user.type(screen.getByLabelText('Reason for revealing'), 'Checking a case');
    await user.click(screen.getByRole('button', { name: 'Reveal' }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    unmount();
    expect(document.body.textContent).not.toContain(SECRET);
  });
});
