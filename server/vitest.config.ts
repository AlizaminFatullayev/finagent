import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Tests never read the developer's .env: everything they need is pinned here.
// The LLM is always the mock provider, so no test can reach the real API.
const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://finagent:finagent@localhost:5432/finagent_test?schema=public',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
  JWT_ACCESS_SECRET: 'test-only-access-secret-that-is-long-enough',
  MASKING_KEY: Buffer.alloc(32, 7).toString('base64'),
  LLM_PROVIDER: 'mock',
  ANTHROPIC_API_KEY: '',
  STORAGE_DIR: join(tmpdir(), 'finagent-test-storage'),
  CORS_ORIGINS: 'http://localhost:5173',
  RATE_LIMIT_GLOBAL_MAX: '100000',
  RATE_LIMIT_AUTH_MAX: '100000',
  RATE_LIMIT_ANALYSIS_MAX: '100000',
};

export default defineConfig({
  test: {
    env: testEnv,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.test.ts'],
          globalSetup: ['test/globalSetup.ts'],
          // Integration files share one database, so they run one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
