import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';
import { testEnv } from './test/testEnv.js';

// The key may come from the shell or the root .env; it is passed to the provider and never printed.
const rootEnvPath = new URL('../.env', import.meta.url);
const rootEnv = existsSync(rootEnvPath) ? parseEnv(readFileSync(rootEnvPath, 'utf8')) : {};
const apiKey = process.env.ANTHROPIC_API_KEY || rootEnv.ANTHROPIC_API_KEY || '';

/**
 * Opt-in live check against the real LLM API (`npm run test:live-llm`). Not part of `npm test`
 * or CI: the file pattern below is outside the default projects, and the suite skips itself
 * unless LIVE_LLM_TEST=1 and an API key are present.
 */
export default defineConfig({
  test: {
    include: ['test/live/**/*.live.ts'],
    globalSetup: ['test/globalSetup.ts'],
    testTimeout: 300_000,
    env: {
      ...testEnv,
      LOG_LEVEL: 'warn',
      LIVE_LLM_TEST: process.env.LIVE_LLM_TEST ?? '',
      // Without a key the env schema would refuse `anthropic`; the suite is skipped in that case anyway.
      LLM_PROVIDER: apiKey ? 'anthropic' : 'mock',
      ANTHROPIC_API_KEY: apiKey,
      LLM_MODEL: process.env.LLM_MODEL || rootEnv.LLM_MODEL || 'claude-sonnet-5-5',
    },
  },
});
