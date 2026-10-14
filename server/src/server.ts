import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

const httpServer = createServer(createApp());

httpServer.listen(env.PORT, () => logger.info({ port: env.PORT }, 'API listening'));

/**
 * Stops accepting connections, lets in-flight requests finish, then releases pools.
 * A hard deadline guarantees the orchestrator's SIGKILL is never needed.
 */
async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  setTimeout(() => process.exit(1), 10_000).unref();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
