import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

// Only the TEST_* connection strings come from the root .env, because ports differ per machine.
const rootEnvPath = new URL('../../.env', import.meta.url);
const rootEnv = existsSync(rootEnvPath) ? parseEnv(readFileSync(rootEnvPath, 'utf8')) : {};
const pick = (key: string) => process.env[key] ?? rootEnv[key];

/**
 * Tests never read the developer's app settings: everything is pinned here.
 * LLM_PROVIDER is always `mock`, so no test can reach the real LLM API.
 */
export const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL:
    pick('TEST_DATABASE_URL') ?? 'postgresql://finagent:finagent@localhost:5432/finagent_test?schema=public',
  REDIS_URL: pick('TEST_REDIS_URL') ?? 'redis://localhost:6379/15',
  JWT_ACCESS_SECRET: 'test-only-access-secret-that-is-long-enough',
  MASKING_KEY: Buffer.alloc(32, 7).toString('base64'),
  LLM_PROVIDER: 'mock',
  ANTHROPIC_API_KEY: '',
  STORAGE_DIR: join(tmpdir(), 'finagent-test-storage'),
  CORS_ORIGINS: 'http://localhost:5173',
  RATE_LIMIT_GLOBAL_MAX: '100000',
  RATE_LIMIT_AUTH_MAX: '100000',
  RATE_LIMIT_ANALYSIS_MAX: '100000',
  // Small cap so the 413 path can be tested without multi-megabyte fixtures.
  UPLOAD_MAX_BYTES: '2000000',
};

/** Destructive test helpers refuse to run unless the target is clearly a local test instance. */
export function assertLocalTestTargets() {
  const db = new URL(testEnv.DATABASE_URL);
  const redis = new URL(testEnv.REDIS_URL);
  const local = ['localhost', '127.0.0.1', '::1'];
  if (!local.includes(db.hostname) || !db.pathname.endsWith('_test')) {
    throw new Error(`Refusing to reset non-local or non-test database: ${db.hostname}${db.pathname}`);
  }
  if (!local.includes(redis.hostname) || redis.pathname !== '/15') {
    throw new Error('Refusing to flush a Redis that is not localhost DB 15');
  }
}
