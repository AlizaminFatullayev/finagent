import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { createLimiter } from '../src/middleware/rateLimit.js';
import { resetState } from './helpers.js';

describe('Redis-backed rate limiter', () => {
  beforeAll(resetState);

  it('returns 429 in the standard error envelope once the budget is spent', async () => {
    const app = express();
    app.use(createLimiter('test', { windowMs: 60_000, limit: 2 }));
    app.get('/', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    const res = await request(app).get('/').expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(res.headers['ratelimit-policy']).toBeDefined();
  });
});
