import { defineConfig } from 'vitest/config';
import { testEnv } from './test/testEnv.js';

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
