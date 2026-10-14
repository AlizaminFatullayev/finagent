import { timingSafeEqual } from 'node:crypto';
import { hmacSha256 } from '../../lib/crypto.js';

/**
 * Signature over `${timestamp}.${body}`. Including the timestamp lets receivers reject replays
 * of an old, validly signed payload.
 */
export const signPayload = (secret: string, timestamp: number, body: string) =>
  `sha256=${hmacSha256(secret, `${timestamp}.${body}`)}`;

/** Reference verification for receivers (also used in tests). */
export function verifySignature(
  secret: string,
  timestamp: number,
  body: string,
  signature: string,
  toleranceSeconds = 300,
  now = Date.now(),
) {
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, body));
  const given = Buffer.from(signature);
  // Constant-time comparison so the signature cannot be guessed byte by byte from timing.
  return expected.length === given.length && timingSafeEqual(expected, given);
}
