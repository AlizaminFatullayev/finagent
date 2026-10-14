import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { processIngest } from '../src/queue/processors/ingest.js';
import { ingestQueue } from '../src/queue/queues.js';
import { userWithToken } from './factories.js';
import { messyWorkbook } from './fixtures.js';
import { resetState } from './helpers.js';

const app = createApp();

function upload(auth: Record<string, string>, buffer: Buffer, name = 'q1.xlsx') {
  return request(app).post('/api/files').set(auth).attach('file', buffer, name);
}

describe('files', () => {
  beforeEach(resetState);

  it('accepts an upload (202), queues ingest and audits it', async () => {
    const { auth, user } = await userWithToken(app);
    const res = await upload(auth, await messyWorkbook(), 'Hesabat_Məbləğ.xlsx').expect(202);
    expect(res.body.data).toMatchObject({
      status: 'UPLOADED',
      ownerId: user.id,
      originalName: 'Hesabat_Məbləğ.xlsx',
    });
    expect(res.body.meta.deduplicated).toBe(false);
    expect(res.body.data.storedName).toBeUndefined();
    expect(await ingestQueue.getJob(res.body.data.id)).toBeDefined();
    expect(
      await prisma.auditLog.count({ where: { action: 'file.upload', resourceId: res.body.data.id } }),
    ).toBe(1);
  });

  it('deduplicates identical uploads by the same user (200)', async () => {
    const { auth } = await userWithToken(app);
    const buffer = await messyWorkbook();
    const first = await upload(auth, buffer).expect(202);
    const second = await upload(auth, buffer, 'renamed.xlsx').expect(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.meta.deduplicated).toBe(true);
    expect(await prisma.file.count()).toBe(1);
  });

  it('rejects fake xlsx, missing files and oversized uploads', async () => {
    const { auth } = await userWithToken(app);
    const fake = await upload(auth, Buffer.from('just text'), 'fake.xlsx').expect(400);
    expect(fake.body.error.code).toBe('UNSUPPORTED_FILE');
    await request(app).post('/api/files').set(auth).expect(422);
    const big = await upload(auth, Buffer.alloc(2_100_000, 'a'), 'big.csv').expect(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('ingests into sheets and rows, then serves schema and paginated rows', async () => {
    const { auth } = await userWithToken(app);
    const { body } = await upload(auth, await messyWorkbook()).expect(202);
    const progress: number[] = [];
    await processIngest(body.data.id, (p) => void progress.push(p));
    expect(progress.at(-1)).toBe(100);

    const detail = await request(app).get(`/api/files/${body.data.id}`).set(auth).expect(200);
    expect(detail.body.data.status).toBe('READY');
    expect(detail.body.data.sheets.map((s: { name: string }) => s.name)).toEqual(['Transactions', 'Summary']);
    expect(detail.body.data.sheets[0]).toMatchObject({ headerRow: 3, rowCount: 3 });

    const sheetId = detail.body.data.sheets[0].id;
    const page1 = await request(app)
      .get(`/api/files/${body.data.id}/rows?sheetId=${sheetId}&limit=2`)
      .set(auth)
      .expect(200);
    expect(page1.body.data.map((r: { rowIndex: number }) => r.rowIndex)).toEqual([4, 5]);
    const page2 = await request(app)
      .get(`/api/files/${body.data.id}/rows?sheetId=${sheetId}&limit=2&cursor=${page1.body.meta.nextCursor}`)
      .set(auth)
      .expect(200);
    expect(page2.body.data.map((r: { rowIndex: number }) => r.rowIndex)).toEqual([7]);
    expect(page2.body.meta.nextCursor).toBeNull();
  });

  it('marks unparseable content FAILED with a safe message', async () => {
    const { auth } = await userWithToken(app);
    const { body } = await upload(auth, Buffer.from('\n\n\n'), 'empty.csv').expect(202);
    await expect(processIngest(body.data.id)).rejects.toThrow();
    const file = await prisma.file.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(file).toMatchObject({ status: 'FAILED', errorMessage: 'No data was found in the file' });
  });

  it('scopes files by owner and role', async () => {
    const a = await userWithToken(app, 'ANALYST');
    const b = await userWithToken(app, 'ANALYST');
    const manager = await userWithToken(app, 'MANAGER');
    const admin = await userWithToken(app, 'ADMIN');
    const { body } = await upload(a.auth, await messyWorkbook()).expect(202);
    const id = body.data.id;

    // Another analyst cannot see it at all (404 hides existence).
    await request(app).get(`/api/files/${id}`).set(b.auth).expect(404);
    expect((await request(app).get('/api/files').set(b.auth)).body.data).toHaveLength(0);
    await request(app).delete(`/api/files/${id}`).set(b.auth).expect(404);

    // Managers see everything but cannot delete other people's files.
    await request(app).get(`/api/files/${id}`).set(manager.auth).expect(200);
    expect((await request(app).get('/api/files').set(manager.auth)).body.data).toHaveLength(1);
    await request(app).delete(`/api/files/${id}`).set(manager.auth).expect(403);

    // Admin can delete; the file disappears but the row is kept (soft delete) and audited.
    await request(app).delete(`/api/files/${id}`).set(admin.auth).expect(200);
    await request(app).get(`/api/files/${id}`).set(a.auth).expect(404);
    expect((await prisma.file.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'file.delete', resourceId: id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'file.view', resourceId: id } })).toBe(1);
  });

  it('always masks PII in rows and refuses the removed unmask flag (410)', async () => {
    const analyst = await userWithToken(app, 'ANALYST');
    const manager = await userWithToken(app, 'MANAGER');
    const { body } = await upload(analyst.auth, await messyWorkbook()).expect(202);
    await processIngest(body.data.id);

    const masked = await request(app).get(`/api/files/${body.data.id}/rows`).set(analyst.auth).expect(200);
    expect(masked.body.meta.masked).toBe(true);
    expect(masked.body.data[0].data.customer).toBe('[PERSON_1]');
    expect(masked.body.data[0].data.amount).toBe(1500.5);
    // The stored vault is ciphertext, never the plain names.
    const vault = await prisma.maskingVault.findUniqueOrThrow({ where: { fileId: body.data.id } });
    expect(vault.encryptedMap).not.toContain('Aysel');

    for (const u of [analyst, manager]) {
      const res = await request(app)
        .get(`/api/files/${body.data.id}/rows?unmask=true`)
        .set(u.auth)
        .expect(410);
      expect(res.body.error.message).toContain('POST /api/files/{id}/unmask');
    }
    expect(await prisma.auditLog.count({ where: { action: 'pii.unmask' } })).toBe(0);
  });
});
