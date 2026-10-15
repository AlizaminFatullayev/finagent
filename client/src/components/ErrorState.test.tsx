import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { ErrorState } from './ErrorState';

describe('ErrorState 429', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts down from Retry-After and then enables Retry', () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <ErrorState
          error={new ApiError(429, 'TOO_MANY_REQUESTS', 'Slow down', null, 'r1', 3)}
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Retry in 0:03' })).toBeDisabled();
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: 'Retry in 0:02' })).toBeDisabled();
    act(() => void vi.advanceTimersByTime(2100));
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeEnabled();
    retry.click();
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows the request id of a 500 for support', () => {
    render(
      <MemoryRouter>
        <ErrorState error={new ApiError(500, 'INTERNAL_ERROR', 'x', null, 'req_01J9')} onRetry={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('req_01J9')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy request id' })).toBeInTheDocument();
  });
});
