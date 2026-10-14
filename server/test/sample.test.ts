import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildSampleWorkbook } from '../scripts/sampleWorkbook.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { processAnalysis } from '../src/queue/processors/analyze.js';
import { processIngest } from '../src/queue/processors/ingest.js';
import { userWithToken } from './factories.js';
import { resetState } from './helpers.js';

const app = createApp();

describe('synthetic sample workbook end to end', () => {
  beforeAll(resetState);

  it('ingests, masks PII and detects every planted anomaly', async () => {
    const { auth } = await userWithToken(app);
    const { body } = await request(app)
      .post('/api/files')
      .set(auth)
      .attach('file', await buildSampleWorkbook(), 'synthetic.xlsx')
      .expect(202);
    await processIngest(body.data.id);

    const file = await request(app).get(`/api/files/${body.data.id}`).set(auth).expect(200);
    const tx = file.body.data.sheets[0];
    expect(tx).toMatchObject({ name: 'Transactions', headerRow: 3 });
    const types = Object.fromEntries(tx.columns.map((c: { name: string; type: string }) => [c.name, c.type]));
    expect(types).toMatchObject({ Date: 'date', 'Amount (AZN)': 'currency', 'Txn ID': 'id' });

    const rows = await request(app).get(`/api/files/${body.data.id}/rows?limit=1`).set(auth).expect(200);
    const masked = JSON.stringify(rows.body.data[0].data);
    for (const token of ['[PERSON_', '[FIN_', '[IBAN_', '[CARD_', '[PHONE_']) expect(masked).toContain(token);

    const created = await request(app)
      .post(`/api/files/${body.data.id}/analyses`)
      .set(auth)
      .send({})
      .expect(202);
    await processAnalysis(created.body.data.id);
    const analysis = await prisma.analysis.findUniqueOrThrow({ where: { id: created.body.data.id } });
    const found = new Set(
      (analysis.result as { anomalies: { type: string }[] }).anomalies.map((a) => a.type),
    );
    for (const type of ['outlier', 'structuring', 'off_hours_burst', 'exact_duplicate'])
      expect(found).toContain(type);

    // Every chart type is produced, and the planted anomalies appear in the anomaly chart.
    const res = await request(app).get(`/api/analyses/${created.body.data.id}/charts`).set(auth).expect(200);
    type Chart = { id: string; type: string; series: { points: { x: string | number; y: number }[] }[] };
    const charts = res.body.data.charts as Chart[];
    const ids = charts.map((c) => c.id);
    for (const prefix of [
      'anomalies-by-type:0',
      'anomalies-by-severity:0',
      'time-series:0:date',
      'histogram:0:amount_azn',
      'top-values:0:',
      'hourly:0:date',
      'data-quality:0',
    ])
      expect(ids.some((id) => id.startsWith(prefix))).toBe(true);
    const byType = charts.find((c) => c.id === 'anomalies-by-type:0')!.series[0]!.points.map((p) => p.x);
    for (const type of ['outlier', 'structuring', 'off_hours_burst', 'exact_duplicate'])
      expect(byType).toContain(type);
    expect(charts.find((c) => c.id === 'hourly:0:date')!.series[0]!.points[2]!.y).toBeGreaterThanOrEqual(8);
    for (const c of charts) for (const s of c.series) expect(s.points.length).toBeLessThanOrEqual(200);
  }, 120_000);
});
