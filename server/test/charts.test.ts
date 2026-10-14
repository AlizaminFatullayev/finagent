import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { processAnalysis } from '../src/queue/processors/analyze.js';
import { processIngest } from '../src/queue/processors/ingest.js';
import { userWithToken } from './factories.js';
import { messyWorkbook } from './fixtures.js';
import { resetState } from './helpers.js';

const app = createApp();

async function analysisFor(auth: Record<string, string>, run = true, language = 'en') {
  const { body } = await request(app)
    .post('/api/files')
    .set(auth)
    .attach('file', await messyWorkbook(), 'q1.xlsx')
    .expect(202);
  await processIngest(body.data.id);
  const created = await request(app)
    .post(`/api/files/${body.data.id}/analyses`)
    .set(auth)
    .send({ language })
    .expect(202);
  if (run) await processAnalysis(created.body.data.id);
  return { fileId: body.data.id as string, analysisId: created.body.data.id as string };
}

describe('GET /api/analyses/:id/charts', () => {
  beforeEach(resetState);

  it('returns masked chart specs and serves repeat calls from the cache', async () => {
    const { auth } = await userWithToken(app);
    const { fileId, analysisId } = await analysisFor(auth);

    const res = await request(app).get(`/api/analyses/${analysisId}/charts`).set(auth).expect(200);
    const charts = res.body.data.charts as {
      id: string;
      sheetId: string;
      series: { points: { x: unknown }[] }[];
    }[];
    const top = charts.find((c) => c.id.startsWith('top-values:0:customer'))!;
    expect(top.series[0]!.points.map((p) => p.x)).toEqual(['[PERSON_1]', '[PERSON_2]', '[PERSON_3]']);
    // Labels and every other field come from masked data only.
    expect(JSON.stringify(res.body)).not.toMatch(/Aysel|Rashad|Leyla/);

    // Second call must not touch the rows: delete them and expect the identical answer.
    const sheets = await prisma.sheet.findMany({ where: { fileId } });
    await prisma.dataRow.deleteMany({ where: { sheetId: { in: sheets.map((s) => s.id) } } });
    const again = await request(app).get(`/api/analyses/${analysisId}/charts`).set(auth).expect(200);
    expect(again.body).toEqual(res.body);

    const second = sheets.find((s) => s.position === 1)!;
    const filtered = await request(app)
      .get(`/api/analyses/${analysisId}/charts?sheetId=${second.id}`)
      .set(auth)
      .expect(200);
    expect(filtered.body.data.charts.length).toBeGreaterThan(0);
    expect(filtered.body.data.charts.every((c: { sheetId: string }) => c.sheetId === second.id)).toBe(true);
    await request(app)
      .get(`/api/analyses/${analysisId}/charts?sheetId=00000000-0000-4000-8000-000000000000`)
      .set(auth)
      .expect(404);
  });

  it('returns 409 until the analysis is completed', async () => {
    const { auth } = await userWithToken(app);
    const { analysisId } = await analysisFor(auth, false);
    const res = await request(app).get(`/api/analyses/${analysisId}/charts`).set(auth).expect(409);
    expect(res.body.error.message).toContain('QUEUED');
  });

  it('applies analysis visibility: other analysts get 404, managers 200', async () => {
    const owner = await userWithToken(app, 'ANALYST');
    const other = await userWithToken(app, 'ANALYST');
    const manager = await userWithToken(app, 'MANAGER');
    const { analysisId } = await analysisFor(owner.auth);
    await request(app).get(`/api/analyses/${analysisId}/charts`).set(other.auth).expect(404);
    await request(app).get(`/api/analyses/${analysisId}/charts`).set(manager.auth).expect(200);
  });

  it('titles follow the analysis language', async () => {
    const { auth } = await userWithToken(app);
    const { analysisId } = await analysisFor(auth, true, 'az');
    const res = await request(app).get(`/api/analyses/${analysisId}/charts`).set(auth).expect(200);
    const titles = res.body.data.charts.map((c: { title: string }) => c.title);
    expect(titles).toContain('Sütunlar üzrə boş dəyərlər');
  });
});
