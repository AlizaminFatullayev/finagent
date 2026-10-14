import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

type Check = 'ok' | 'error';

/** Readiness means every dependency a request needs is reachable right now. */
export async function checkReadiness(): Promise<{ ready: boolean; checks: Record<string, Check> }> {
  const [db, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  const checks = {
    database: db.status === 'fulfilled' ? 'ok' : 'error',
    redis: cache.status === 'fulfilled' ? 'ok' : 'error',
  } satisfies Record<string, Check>;
  return { ready: Object.values(checks).every((c) => c === 'ok'), checks };
}
