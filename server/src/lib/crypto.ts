import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const key = Buffer.from(env.MASKING_KEY, 'base64');

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** URL-safe random token, used for refresh tokens and webhook secrets. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const hmacSha256 = (secret: string, data: string) =>
  createHmac('sha256', secret).update(data).digest('hex');

/**
 * AES-256-GCM encryption. Output is `iv.tag.ciphertext` (base64); the auth tag makes any
 * tampering with stored ciphertext fail loudly on decrypt instead of yielding garbage.
 */
export function seal(plaintext: string): string {
  // A fresh 96-bit IV per message is required for GCM security.
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64')).join('.');
}

export function unseal(sealed: string): string {
  const [iv, tag, ciphertext] = sealed.split('.').map((part) => Buffer.from(part, 'base64'));
  if (!iv || !tag || !ciphertext) throw new Error('Malformed sealed value');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
