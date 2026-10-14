import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../config/env.js';

/** Blob storage for uploaded workbooks. Swap the implementation for S3/R2 without touching callers. */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

// Keys are server-generated "<uuid>.<ext>"; anything else is refused, so path traversal is impossible.
const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(xlsx|csv)$/;

export class LocalDiskStorage implements Storage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string) {
    if (!KEY_PATTERN.test(key)) throw new Error(`Invalid storage key: ${key}`);
    return resolve(this.root, key);
  }

  async put(key: string, data: Buffer) {
    await mkdir(this.root, { recursive: true });
    // `wx` fails instead of overwriting if a key ever collides.
    await writeFile(this.pathFor(key), data, { flag: 'wx', mode: 0o600 });
  }

  async get(key: string) {
    return createReadStream(this.pathFor(key));
  }

  async delete(key: string) {
    await rm(this.pathFor(key), { force: true });
  }
}

export const storage: Storage = new LocalDiskStorage(env.STORAGE_DIR);
