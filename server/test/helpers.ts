import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { assertLocalTestTargets } from './testEnv.js';

/** Empties every table and the test Redis DB so each file starts from a known state. */
export async function resetState() {
  assertLocalTestTargets();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  // TRUNCATE is not blocked by the audit-log row trigger, which only guards UPDATE/DELETE.
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await redis.flushdb();
}
