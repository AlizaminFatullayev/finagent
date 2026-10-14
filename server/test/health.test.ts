import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { resetState } from './helpers.js';

const app = createApp();

describe('foundation', () => {
  beforeAll(resetState);

  it('GET /health is a dependency-free liveness probe', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toEqual({ data: { status: 'ok' }, meta: {} });
  });

  it('GET /ready checks database and Redis', async () => {
    const res = await request(app).get('/ready').expect(200);
    expect(res.body.data).toEqual({ ready: true, checks: { database: 'ok', redis: 'ok' } });
  });

  it('unknown routes return the error envelope with the request id', async () => {
    const res = await request(app).get('/nope').set('X-Request-Id', 'abc-123').expect(404);
    expect(res.headers['x-request-id']).toBe('abc-123');
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: 'abc-123' });
  });

  it('ignores unsafe incoming request ids', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'bad id <script>');
    expect(res.headers['x-request-id']).not.toContain('bad');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
