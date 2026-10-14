import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Creates a Redis connection. BullMQ requires `maxRetriesPerRequest: null` so blocking commands
 * wait for reconnects instead of throwing; the same setting is harmless for other uses.
 */
export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

// Shared connection for cache, rate limiting and publishing; subscribers need their own.
export const redis = createRedis();
