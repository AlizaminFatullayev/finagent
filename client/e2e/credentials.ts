import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type RoleName = 'admin' | 'manager' | 'analyst';

/**
 * Seed-user credentials for local e2e runs: environment first, then the documented local-dev values in
 * the repository's .env.example. Nothing is hardcoded here.
 */
export function credentials(role: RoleName) {
  const upper = role.toUpperCase();
  let example: Record<string, string> = {};
  try {
    const text = readFileSync(fileURLToPath(new URL('../../.env.example', import.meta.url)), 'utf8');
    example = Object.fromEntries(
      text
        .split('\n')
        .filter((l) => /^SEED_[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    );
  } catch {
    // Environment only.
  }
  const email = process.env[`SEED_${upper}_EMAIL`] ?? example[`SEED_${upper}_EMAIL`];
  const password = process.env[`SEED_${upper}_PASSWORD`] ?? example[`SEED_${upper}_PASSWORD`];
  if (!email || !password) throw new Error(`Missing SEED_${upper}_EMAIL / SEED_${upper}_PASSWORD`);
  return { email, password };
}
