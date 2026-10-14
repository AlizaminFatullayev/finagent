import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { cacheRedisKey } from '../src/modules/analyses/service.js';
import { processAnalysis } from '../src/queue/processors/analyze.js';
import { processIngest } from '../src/queue/processors/ingest.js';
import { userWithToken } from './factories.js';
import { messyWorkbook } from './fixtures.js';
import { resetState } from './helpers.js';

const app = createApp();
const unmaskBody = { tokens: ['[PERSON_1]'], reason: 'Access hardening check' };

/** A completed analysis whose analysis and chart caches are both warm. */
async function warmAnalysis(auth: Record<string, string>) {
  const { body } = await request(app)
    .post('/api/files')
    .set(auth)
    .attach('file', await messyWorkbook(), 'q1.xlsx');
  await processIngest(body.data.id);
  const created = await request(app).post(`/api/files/${body.data.id}/analyses`).set(auth).send({});
  await processAnalysis(created.body.data.id);
  await request(app).get(`/api/analyses/${created.body.data.id}/charts`).set(auth).expect(200);
  return { fileId: body.data.id as string, analysisId: created.body.data.id as string };
}

/** Every route that exposes a file or something derived from it. */
const derivedRoutes = (fileId: string, analysisId: string) =>
  [
    ['GET file', request(app).get(`/api/files/${fileId}`)],
    ['GET rows', request(app).get(`/api/files/${fileId}/rows`)],
    ['GET analyses', request(app).get(`/api/files/${fileId}/analyses`)],
    ['POST analyses', request(app).post(`/api/files/${fileId}/analyses`).send({})],
    ['POST unmask', request(app).post(`/api/files/${fileId}/unmask`).send(unmaskBody)],
    ['GET analysis', request(app).get(`/api/analyses/${analysisId}`)],
    ['GET charts', request(app).get(`/api/analyses/${analysisId}/charts`)],
    ['GET export', request(app).get(`/api/analyses/${analysisId}/export?format=xlsx`)],
  ] as const;

describe('access to soft-deleted and foreign files', () => {
  beforeEach(resetState);

  it('returns 404 everywhere for a soft-deleted file even with warm caches', async () => {
    const owner = await userWithToken(app);
    const manager = await userWithToken(app, 'MANAGER');
    const admin = await userWithToken(app, 'ADMIN');
    const { fileId, analysisId } = await warmAnalysis(owner.auth);

    const { cacheKey } = await prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } });
    expect(await redis.get(cacheRedisKey(cacheKey))).toBe(analysisId);
    expect(await redis.keys('charts:*')).toHaveLength(1);

    await request(app).delete(`/api/files/${fileId}`).set(owner.auth).expect(200);
    for (const u of [owner, manager, admin]) {
      for (const [route, req] of derivedRoutes(fileId, analysisId)) {
        expect([route, (await req.set(u.auth)).status]).toEqual([route, 404]);
      }
    }
    // No new analysis, export or reveal slipped through on a deleted file.
    expect(await prisma.analysis.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: { in: ['report.export', 'pii.unmask'] } } })).toBe(
      0,
    );
  });

  it("returns 404, not 403, for another analyst's file and analysis", async () => {
    const owner = await userWithToken(app);
    const other = await userWithToken(app);
    const { fileId, analysisId } = await warmAnalysis(owner.auth);

    for (const [route, req] of derivedRoutes(fileId, analysisId)) {
      expect([route, (await req.set(other.auth)).status]).toEqual([route, 404]);
    }
  });
});
