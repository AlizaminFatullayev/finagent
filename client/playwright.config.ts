import { defineConfig, devices } from '@playwright/test';

/**
 * Local e2e smoke against the real stack (never in CI): Postgres and Redis from docker compose,
 * migrations and seed, the API and worker with the mock LLM provider, and the Vite dev server.
 * Already running servers are reused.
 */
const serverEnv = {
  LLM_PROVIDER: 'mock',
  // Many logins and analyses in a short run; local limits only.
  RATE_LIMIT_AUTH_MAX: '2000',
  RATE_LIMIT_GLOBAL_MAX: '100000',
  RATE_LIMIT_ANALYSIS_MAX: '1000',
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      name: 'api',
      cwd: '../server',
      command:
        'docker compose -f ../docker-compose.yml up -d db redis && npm run db:deploy && npm run db:seed && npm run sample:xlsx && npm run dev:api',
      url: 'http://localhost:3000/ready',
      env: serverEnv,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      name: 'worker',
      cwd: '../server',
      command: 'npm run dev:worker',
      env: serverEnv,
      wait: { stdout: /worker started/ },
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      name: 'web',
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
