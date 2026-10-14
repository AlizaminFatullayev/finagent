import { describe, expect, it } from 'vitest';
import { signPayload, verifySignature } from './signing.js';

describe('webhook signatures', () => {
  const now = 1_760_000_000_000;
  const ts = now / 1000;

  it('verifies a genuine signature', () => {
    expect(verifySignature('s3cret', ts, '{"a":1}', signPayload('s3cret', ts, '{"a":1}'), 300, now)).toBe(
      true,
    );
  });

  it('rejects tampered bodies, wrong secrets and stale timestamps', () => {
    const sig = signPayload('s3cret', ts, '{"a":1}');
    expect(verifySignature('s3cret', ts, '{"a":2}', sig, 300, now)).toBe(false);
    expect(verifySignature('other', ts, '{"a":1}', sig, 300, now)).toBe(false);
    expect(verifySignature('s3cret', ts, '{"a":1}', sig, 300, now + 301_000)).toBe(false);
  });
});
