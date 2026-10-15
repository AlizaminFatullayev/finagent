import { describe, expect, it } from 'vitest';
import { fieldErrors, parseRetryAfter, toApiError } from './errors';

const res = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });

describe('toApiError', () => {
  it('reads the error envelope and the Retry-After header of a 429', () => {
    const body = {
      error: { code: 'TOO_MANY_REQUESTS', message: 'Slow down', details: null, requestId: 'r1' },
    };
    const err = toApiError(res(429, { 'Retry-After': '17' }), body);
    expect(err).toMatchObject({
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'Slow down',
      requestId: 'r1',
    });
    expect(err.retryAfter).toBe(17);
  });

  it('falls back to a generic code when the body is not an envelope', () => {
    expect(toApiError(res(502), 'oops')).toMatchObject({ code: 'INTERNAL_ERROR', retryAfter: null });
  });
});

describe('parseRetryAfter', () => {
  it('accepts seconds and HTTP dates', () => {
    expect(parseRetryAfter('3')).toBe(3);
    expect(parseRetryAfter(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThanOrEqual(4);
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe('fieldErrors', () => {
  it('maps 422 details to the first message per path', () => {
    const err = toApiError(res(422), {
      error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ path: 'email', message: 'Invalid' }] },
    });
    expect(fieldErrors(err)).toEqual({ email: 'Invalid' });
    expect(fieldErrors(new Error('x'))).toEqual({});
  });
});
