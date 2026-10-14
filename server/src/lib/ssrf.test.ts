import { describe, expect, it } from 'vitest';
import { assertSafeUrl, isPrivateAddress } from './ssrf.js';

describe('SSRF guard', () => {
  it('classifies private, loopback, link-local and mapped addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fe80::1',
      'fd00::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['93.184.215.14', '8.8.8.8', '2606:4700::1111'])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('rejects unsafe URLs before any request is made', async () => {
    const cases = [
      'http://127.0.0.1/hook',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]:8080/',
      'http://localhost:3000/',
      'http://10.0.0.5/',
      'https://user:pass@93.184.215.14/',
      'ftp://93.184.215.14/',
      'not a url',
    ];
    for (const url of cases) await expect(assertSafeUrl(url, { allowHttp: true }), url).rejects.toThrow();
  });

  it('requires https unless http is explicitly allowed', async () => {
    await expect(assertSafeUrl('http://93.184.215.14/hook', { allowHttp: false })).rejects.toThrow();
    await expect(assertSafeUrl('https://93.184.215.14/hook', { allowHttp: false })).resolves.toBeInstanceOf(
      URL,
    );
  });
});
