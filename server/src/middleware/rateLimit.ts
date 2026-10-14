import { rateLimit, type Options } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { TooManyRequestsError } from '../lib/errors.js';
import { redis } from '../lib/redis.js';

/**
 * Builds a limiter whose counters live in Redis, so the limit holds across all API replicas
 * and survives restarts. Rejections go through the error handler to keep the error envelope.
 */
export function createLimiter(name: string, options: Partial<Options>) {
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new RedisStore({
      prefix: `rl:${name}:`,
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<RedisReply>,
    }),
    handler: (_req, _res, next) => next(new TooManyRequestsError()),
    ...options,
  });
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const globalLimiter = createLimiter('global', {
  windowMs: FIFTEEN_MINUTES,
  limit: env.RATE_LIMIT_GLOBAL_MAX,
});

// Login and refresh are the brute-force targets, so they get a much smaller budget per IP.
export const authLimiter = createLimiter('auth', {
  windowMs: FIFTEEN_MINUTES,
  limit: env.RATE_LIMIT_AUTH_MAX,
});

// Analyses cost LLM tokens, so the budget is per user (not per IP) and hourly.
export const analysisLimiter = createLimiter('analysis', {
  windowMs: 60 * 60 * 1000,
  limit: env.RATE_LIMIT_ANALYSIS_MAX,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
});

// Every reveal exposes customer PII, so it gets a small per-user budget regardless of role.
export const unmaskLimiter = createLimiter('unmask', {
  windowMs: 10 * 60 * 1000,
  limit: env.RATE_LIMIT_UNMASK_MAX,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
});
