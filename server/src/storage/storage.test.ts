import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { LocalDiskStorage } from './storage.js';

describe('LocalDiskStorage', () => {
  it('stores and reads back by uuid key', async () => {
    const storage = new LocalDiskStorage(await mkdtemp(join(tmpdir(), 'fa-')));
    const key = '123e4567-e89b-42d3-a456-426614174000.csv';
    await storage.put(key, Buffer.from('a,b'));
    expect((await buffer(await storage.get(key))).toString()).toBe('a,b');
    await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow();
  });

  it('refuses keys that could escape the storage root', async () => {
    const storage = new LocalDiskStorage(await mkdtemp(join(tmpdir(), 'fa-')));
    for (const key of ['../etc/passwd', 'report.xlsx', '/abs/123e4567-e89b-42d3-a456-426614174000.csv']) {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
    }
  });
});
