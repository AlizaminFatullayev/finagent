import { execSync } from 'node:child_process';
import { assertLocalTestTargets, testEnv } from './testEnv.js';

/** Brings the test database schema up to date once per run (non-destructive `migrate deploy`). */
export default function setup() {
  assertLocalTestTargets();
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, ...testEnv },
  });
}
