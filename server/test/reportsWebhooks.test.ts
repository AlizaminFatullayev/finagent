import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { verifySignature } from '../src/modules/webhooks/signing.js';
import { dispatchWebhookEvent } from '../src/modules/webhooks/service.js';
import { processAnalysis } from '../src/queue/processors/analyze.js';
import { processIngest } from '../src/queue/processors/ingest.js';
import { postJson, processWebhookDelivery } from '../src/queue/processors/webhookDelivery.js';
import { userWithToken } from './factories.js';
import { messyWorkbook } from './fixtures.js';
import { resetState } from './helpers.js';

const app = createApp();
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function completedAnalysis(auth: Record<string, string>) {
  const { body } = await request(app)
    .post('/api/files')
    .set(auth)
    .attach('file', await messyWorkbook(), 'q1.xlsx');
  await processIngest(body.data.id);
  const created = await request(app).post(`/api/files/${body.data.id}/analyses`).set(auth).send({});
  return created.body.data.id as string;
}

describe('report export', () => {
  beforeEach(resetState);

  it('exports xlsx and pdf, audits each export and refuses unfinished analyses', async () => {
    const { auth, user } = await userWithToken(app);
    const id = await completedAnalysis(auth);
    await request(app).get(`/api/analyses/${id}/export?format=pdf`).set(auth).expect(409);
    await processAnalysis(id);

    const xlsx = await request(app)
      .get(`/api/analyses/${id}/export?format=xlsx`)
      .set(auth)
      .buffer()
      .parse(binary)
      .expect(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
    expect(xlsx.headers['content-disposition']).toContain(`finagent-report-${id}.xlsx`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.read(Readable.from(xlsx.body as Buffer));
    expect(wb.getWorksheet('Summary')!.getRow(4).getCell(2).value).toMatch(
      /Analysed 1 sheet|Analysed 2 sheet/,
    );

    const pdf = await request(app)
      .get(`/api/analyses/${id}/export`)
      .set(auth)
      .buffer()
      .parse(binary)
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    expect(await prisma.auditLog.count({ where: { action: 'report.export', actorId: user.id } })).toBe(2);
    await request(app).get(`/api/analyses/${id}/export?format=docx`).set(auth).expect(422);
  });
});

describe('webhooks', () => {
  beforeEach(resetState);

  it('lets admins manage webhooks, shows the secret once and blocks SSRF targets', async () => {
    const admin = await userWithToken(app, 'ADMIN');
    const analyst = await userWithToken(app, 'ANALYST');
    await request(app)
      .post('/api/webhooks')
      .set(analyst.auth)
      .send({ url: 'https://93.184.215.14/hook' })
      .expect(403);

    for (const url of [
      'http://127.0.0.1:9/x',
      'http://169.254.169.254/latest',
      'http://localhost/x',
      'http://192.168.0.10/',
    ]) {
      const res = await request(app).post('/api/webhooks').set(admin.auth).send({ url }).expect(422);
      expect(res.body.error.details[0].path).toBe('url');
    }

    const created = await request(app)
      .post('/api/webhooks')
      .set(admin.auth)
      .send({ url: 'https://93.184.215.14/hook' })
      .expect(201);
    expect(created.body.data.secret).toHaveLength(43);
    expect(created.body.data.events).toEqual(['analysis.completed', 'analysis.failed']);
    const stored = await prisma.webhook.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(stored.secretEncrypted).not.toContain(created.body.data.secret);

    const list = await request(app).get('/api/webhooks').set(admin.auth).expect(200);
    expect(list.body.data[0].secret).toBeUndefined();

    await request(app).delete(`/api/webhooks/${created.body.data.id}`).set(admin.auth).expect(200);
    await request(app).delete(`/api/webhooks/${created.body.data.id}`).set(admin.auth).expect(404);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'webhook.' } } })).toBe(2);
  });

  it('signs deliveries, retries failures and records the delivery log', async () => {
    const admin = await userWithToken(app, 'ADMIN');
    const { body } = await request(app)
      .post('/api/webhooks')
      .set(admin.auth)
      .send({ url: 'https://93.184.215.14/hook' })
      .expect(201);
    await dispatchWebhookEvent('analysis.completed', { analysisId: 'a1' });
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();

    // First attempt: receiver is down.
    await expect(processWebhookDelivery(delivery.id, false, async () => 503)).rejects.toThrow(/503/);
    expect(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).toMatchObject({
      status: 'PENDING',
      attempts: 1,
    });

    // Second attempt succeeds; the receiver can verify the signature with the shared secret.
    let captured: { body: string; headers: Record<string, string> } | undefined;
    await processWebhookDelivery(delivery.id, false, async (_url, payload, headers) => {
      captured = { body: payload, headers };
      return 200;
    });
    const h = captured!.headers;
    expect(
      verifySignature(
        body.data.secret,
        Number(h['x-finagent-timestamp']),
        captured!.body,
        h['x-finagent-signature']!,
      ),
    ).toBe(true);
    expect(JSON.parse(captured!.body)).toMatchObject({
      event: 'analysis.completed',
      data: { analysisId: 'a1' },
    });
    expect(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).toMatchObject({
      status: 'SUCCESS',
      attempts: 2,
      responseStatus: 200,
    });
  });

  it('marks the delivery FAILED after the last attempt', async () => {
    const admin = await userWithToken(app, 'ADMIN');
    await request(app)
      .post('/api/webhooks')
      .set(admin.auth)
      .send({ url: 'https://93.184.215.14/hook' })
      .expect(201);
    await dispatchWebhookEvent('analysis.failed', { analysisId: 'a2' });
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    await expect(processWebhookDelivery(delivery.id, true, async () => 500)).rejects.toThrow();
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe(
      'FAILED',
    );
  });

  it('refuses to connect when a hostname resolves to a private address at send time (DNS rebinding)', async () => {
    const receiver = createServer((_req, res) => res.end('ok'));
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
    const port = (receiver.address() as AddressInfo).port;
    await expect(postJson(`http://localhost:${port}/`, '{}', {})).rejects.toThrow(/private address/);
    receiver.close();
  });
});
