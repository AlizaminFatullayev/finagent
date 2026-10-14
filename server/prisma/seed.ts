import argon2 from 'argon2';
import { env } from '../src/config/env.js';
import type { Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';

// Demo accounts are for local development only; production users are created by an admin.
if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo users in production.');
  process.exit(1);
}

const users: { role: Role; name: string; emailVar: string; passwordVar: string }[] = [
  { role: 'ADMIN', name: 'Demo Admin', emailVar: 'SEED_ADMIN_EMAIL', passwordVar: 'SEED_ADMIN_PASSWORD' },
  {
    role: 'MANAGER',
    name: 'Demo Manager',
    emailVar: 'SEED_MANAGER_EMAIL',
    passwordVar: 'SEED_MANAGER_PASSWORD',
  },
  {
    role: 'ANALYST',
    name: 'Demo Analyst',
    emailVar: 'SEED_ANALYST_EMAIL',
    passwordVar: 'SEED_ANALYST_PASSWORD',
  },
];

for (const u of users) {
  const email = process.env[u.emailVar]?.toLowerCase();
  const password = process.env[u.passwordVar];
  if (!email || !password)
    throw new Error(`${u.emailVar} and ${u.passwordVar} must be set (see .env.example)`);
  // Idempotent: existing users are left untouched so re-seeding never resets a changed password.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`exists   ${u.role.padEnd(7)} ${email}`);
    continue;
  }
  await prisma.user.create({
    data: { email, name: u.name, role: u.role, passwordHash: await argon2.hash(password) },
  });
  console.log(`created  ${u.role.padEnd(7)} ${email}`);
}

await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
