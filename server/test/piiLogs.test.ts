import { Writable } from 'node:stream';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSampleWorkbook, sampleSensitiveValues } from '../scripts/sampleWorkbook.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { processAnalysis } from '../src/queue/processors/analyze.js';
import { processIngest } from '../src/queue/processors/ingest.js';
import { processWebhookDelivery } from '../src/queue/processors/webhookDelivery.js';
import type * as LoggerModule from '../src/lib/logger.js';
import { userWithToken } from './factories.js';
import { resetState } from './helpers.js';

const captured = vi.hoisted(() => ({ lines: [] as string[] }));

// The real logger configuration (redaction included) at info level, writing to memory instead of stdout.
vi.mock('../src/lib/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof LoggerModule>();
  const sink = new Writable({
    write(chunk, _encoding, done) {
      captured.lines.push(String(chunk));
      done();
    },
  });
  return { ...actual, logger: actual.createLogger('info', sink) };
});

const app = createApp();

describe('no plaintext PII in logs or audit rows', () => {
  beforeAll(resetState);

  it('runs the main flow on the synthetic sample without leaking sensitive values', async () => {
    const workbook = await buildSampleWorkbook();
    const forbidden = await sampleSensitiveValues(workbook);
    expect(forbidden.length).toBeGreaterThan(500);

    const { auth } = await userWithToken(app);
    const admin = await userWithToken(app, 'ADMIN');
    await request(app)
      .post('/api/webhooks')
      .set(admin.auth)
      .send({ url: 'https://93.184.215.14/hook' })
      .expect(201);

    const upload = await request(app)
      .post('/api/files')
      .set(auth)
      .attach('file', workbook, 'synthetic.xlsx')
      .expect(202);
    const fileId = upload.body.data.id as string;
    await processIngest(fileId);
    const created = await request(app).post(`/api/files/${fileId}/analyses`).set(auth).send({}).expect(202);
    const analysisId = created.body.data.id as string;
    await processAnalysis(analysisId);

    const rows = await request(app).get(`/api/files/${fileId}/rows?limit=5`).set(auth).expect(200);
    await request(app).get(`/api/analyses/${analysisId}/charts`).set(auth).expect(200);
    const tokens = [...new Set(JSON.stringify(rows.body.data).match(/\[[A-Z]+_\d+\]/g))];
    const revealed = await request(app)
      .post(`/api/files/${fileId}/unmask`)
      .set(auth)
      .send({ tokens, reason: 'Log leak regression test' })
      .expect(200);
    // The reveal really returned plaintext, so its absence from the logs below is meaningful.
    expect(Object.values(revealed.body.data.values).some((v) => forbidden.includes(v as string))).toBe(true);
    await request(app).get(`/api/analyses/${analysisId}/export?format=pdf`).set(auth).expect(200);
    await request(app).get(`/api/analyses/${analysisId}/export?format=xlsx`).set(auth).expect(200);

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({
      where: { event: 'analysis.completed' },
    });
    await processWebhookDelivery(delivery.id, true, async () => 200);

    const logs = captured.lines.join('');
    expect(logs).toContain('request completed');
    expect(logs).toContain('/unmask');
    const audit = JSON.stringify(await prisma.auditLog.findMany());
    expect(audit).toContain('pii.unmask');
    const leaks = forbidden.filter((v) => logs.includes(v) || audit.includes(v));
    expect(leaks).toEqual([]);
  }, 120_000);
});
