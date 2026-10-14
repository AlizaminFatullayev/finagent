import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { processIngest } from '../src/queue/processors/ingest.js';
import { userWithToken } from './factories.js';
import { messyWorkbook } from './fixtures.js';
import { resetState } from './helpers.js';

const app = createApp();
const reason = 'Customer complaint #4411 needs the payer name';

async function ingestedFile(auth: Record<string, string>) {
  const { body } = await request(app)
    .post('/api/files')
    .set(auth)
    .attach('file', await messyWorkbook(), 'q1.xlsx')
    .expect(202);
  await processIngest(body.data.id);
  return body.data.id as string;
}

const unmask = (auth: Record<string, string>, fileId: string, body: object) =>
  request(app).post(`/api/files/${fileId}/unmask`).set(auth).send(body);

describe('POST /api/files/:id/unmask', () => {
  beforeEach(resetState);

  it('reveals requested tokens, reports unknown ones, sets no-store and audits without values', async () => {
    const owner = await userWithToken(app, 'ANALYST');
    const fileId = await ingestedFile(owner.auth);

    const res = await unmask(owner.auth, fileId, {
      tokens: ['[PERSON_1]', '[PERSON_1]', '[IBAN_99]'],
      reason,
    }).expect(200);
    expect(res.body.data).toEqual({ values: { '[PERSON_1]': 'Aysel Mammadova' }, notFound: ['[IBAN_99]'] });
    expect(res.headers['cache-control']).toBe('no-store');

    const audits = await prisma.auditLog.findMany({ where: { action: 'pii.unmask', resourceId: fileId } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: owner.user.id,
      metadata: { reason, tokenCount: 2, tokenTypes: ['IBAN', 'PERSON'], notFoundCount: 1 },
    });
    expect(audits[0]!.ip).toBeTruthy();
    expect(JSON.stringify(audits)).not.toContain('Aysel');
  });

  it('follows file visibility: other analysts get 404, managers and admins may reveal', async () => {
    const owner = await userWithToken(app, 'ANALYST');
    const other = await userWithToken(app, 'ANALYST');
    const manager = await userWithToken(app, 'MANAGER');
    const admin = await userWithToken(app, 'ADMIN');
    const fileId = await ingestedFile(owner.auth);
    const body = { tokens: ['[PERSON_2]'], reason };

    await unmask(other.auth, fileId, body).expect(404);
    for (const u of [manager, admin]) {
      const res = await unmask(u.auth, fileId, body).expect(200);
      expect(res.body.data.values['[PERSON_2]']).toBe('Rashad Aliyev');
    }
  });

  it('refuses roles removed from UNMASK_ALLOWED_ROLES', async () => {
    const owner = await userWithToken(app, 'ANALYST');
    const fileId = await ingestedFile(owner.auth);
    const allowed = env.UNMASK_ALLOWED_ROLES;
    env.UNMASK_ALLOWED_ROLES = ['MANAGER', 'ADMIN'];
    try {
      await unmask(owner.auth, fileId, { tokens: ['[PERSON_1]'], reason }).expect(403);
    } finally {
      env.UNMASK_ALLOWED_ROLES = allowed;
    }
    expect(await prisma.auditLog.count({ where: { action: 'pii.unmask' } })).toBe(0);
  });

  it('validates tokens and reason (422)', async () => {
    const { auth } = await userWithToken(app);
    const fileId = await ingestedFile(auth);
    const tooMany = Array.from({ length: 51 }, (_, i) => `[PERSON_${i + 1}]`);
    for (const body of [
      { tokens: ['[PERSON_1]'] },
      { tokens: ['[PERSON_1]'], reason: 'why' },
      { tokens: [], reason },
      { tokens: tooMany, reason },
      { tokens: ['Aysel'], reason },
    ]) {
      const res = await unmask(auth, fileId, body).expect(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns 404 for a soft-deleted file', async () => {
    const { auth } = await userWithToken(app);
    const fileId = await ingestedFile(auth);
    await request(app).delete(`/api/files/${fileId}`).set(auth).expect(200);
    await unmask(auth, fileId, { tokens: ['[PERSON_1]'], reason }).expect(404);
  });

  it('rate limits reveals per user (429)', async () => {
    const { auth } = await userWithToken(app);
    const fileId = await ingestedFile(auth);
    // Invalid bodies still spend the budget, which keeps this test fast.
    for (let i = 0; i < env.RATE_LIMIT_UNMASK_MAX; i++) await unmask(auth, fileId, {}).expect(422);
    const res = await unmask(auth, fileId, { tokens: ['[PERSON_1]'], reason }).expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
