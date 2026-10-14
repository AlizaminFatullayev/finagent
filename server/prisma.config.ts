import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The CLI reads the same repo-root .env as the app; containers and CI inject real env vars instead.
const rootEnv = new URL('../.env', import.meta.url);
if (process.env.NODE_ENV !== 'test' && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` does not need a database, so a missing URL must not break installs.
    url: process.env.DATABASE_URL ?? '',
  },
});
