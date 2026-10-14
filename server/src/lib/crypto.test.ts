import { describe, expect, it } from 'vitest';
import { seal, sha256, unseal } from './crypto.js';

describe('crypto', () => {
  it('round-trips sealed values with a fresh IV each time', () => {
    const a = seal('IBAN AZ21NABZ00000000137010001944');
    expect(a).not.toBe(seal('IBAN AZ21NABZ00000000137010001944'));
    expect(unseal(a)).toBe('IBAN AZ21NABZ00000000137010001944');
  });

  it('rejects tampered ciphertext', () => {
    const [iv, tag, ct] = seal('secret').split('.');
    const flipped = Buffer.from(ct!, 'base64');
    flipped[0] = flipped[0]! ^ 1;
    expect(() => unseal([iv, tag, flipped.toString('base64')].join('.'))).toThrow();
  });

  it('hashes deterministically', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
