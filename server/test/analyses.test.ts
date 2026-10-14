import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { ChatMessage, LLMProvider, LLMResponse } from '../src/domain/agent/llm/types.js';
import { prisma } from '../src/lib/prisma.js';
import { failAnalysis, processAnalysis } from '../src/queue/processors/analyze.js';
import { processIngest } from '../src/queue/processors/ingest.js';
import { analyzeQueue } from '../src/queue/queues.js';
import { userWithToken } from './factories.js';
import { messyWorkbook } from './fixtures.js';
import { resetState } from './helpers.js';

const app = createApp();

async function readyFile(auth: Record<string, string>) {
  const { body } = await request(app)
    .post('/api/files')
    .set(auth)
    .attach('file', await messyWorkbook(), 'q1.xlsx');
  await processIngest(body.data.id);
  return body.data.id as string;
}

/** Records what the LLM is shown, to prove raw PII never reaches it. */
class SpyProvider implements LLMProvider {
  readonly name = 'spy';
  readonly model = 'spy-1';
  readonly transcript: ChatMessage[][] = [];
  async complete(messages: ChatMessage[]): Promise<LLMResponse> {
    this.transcript.push(structuredClone(messages));
    const base = {
      text: '',
      stopReason: 'tool_use' as const,
      usage: { inputTokens: 1, outputTokens: 1 },
      model: this.model,
    };
    if (this.transcript.length === 1)
      return { ...base, toolCalls: [{ id: 'a', name: 'get_sample_rows', input: { sheet: 'Transactions' } }] };
    return {
      ...base,
      toolCalls: [
        {
          id: 'b',
          name: 'submit_summary',
          input: {
            headline: 'Total is 999,999 AZN',
            keyMetrics: [],
            trends: [],
            risks: [],
            anomalyHighlights: [],
            recommendations: [],
            caveats: [],
          },
        },
      ],
    };
  }
}

describe('analyses', () => {
  beforeEach(resetState);

  it('queues an analysis (202), completes it with the mock provider and serves the result', async () => {
    const { auth } = await userWithToken(app);
    const fileId = await readyFile(auth);

    const created = await request(app)
      .post(`/api/files/${fileId}/analyses`)
      .set(auth)
      .send({ language: 'az' })
      .expect(202);
    expect(created.body.data).toMatchObject({ status: 'QUEUED', cached: false, language: 'az' });
    expect(await analyzeQueue.getJob(created.body.data.id)).toBeDefined();

    const stages: string[] = [];
    await processAnalysis(created.body.data.id, (stage) => void stages.push(stage));
    expect(stages).toEqual(['parsing', 'analyzing', 'summarizing', 'done']);

    const done = await request(app).get(`/api/analyses/${created.body.data.id}`).set(auth).expect(200);
    expect(done.body.data.status).toBe('COMPLETED');
    expect(done.body.data.result.summary.headline).toMatch(/vərəq/);
    expect(done.body.data.result.methodology.length).toBe(7);
    expect(done.body.data.verification).toMatchObject({ unverified: [] });
    expect(done.body.data.tokenUsage.inputTokens).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { action: 'analysis.run' } })).toBe(1);

    const list = await request(app).get(`/api/files/${fileId}/analyses`).set(auth).expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('reuses a completed identical analysis from the cache (201, cached)', async () => {
    const { auth } = await userWithToken(app);
    const fileId = await readyFile(auth);
    const first = await request(app).post(`/api/files/${fileId}/analyses`).set(auth).send({}).expect(202);
    await processAnalysis(first.body.data.id);

    const second = await request(app).post(`/api/files/${fileId}/analyses`).set(auth).send({}).expect(201);
    expect(second.body.data).toMatchObject({
      status: 'COMPLETED',
      cached: true,
      tokenUsage: { inputTokens: 0 },
    });
    expect(second.body.data.result.summary).toEqual(
      (await request(app).get(`/api/analyses/${first.body.data.id}`).set(auth)).body.data.result.summary,
    );
    // A different language is a different request and is not served from cache.
    await request(app).post(`/api/files/${fileId}/analyses`).set(auth).send({ language: 'az' }).expect(202);
  });

  it('never shows raw PII to the LLM and flags unverifiable figures as caveats', async () => {
    const { auth } = await userWithToken(app);
    const fileId = await readyFile(auth);
    const created = await request(app).post(`/api/files/${fileId}/analyses`).set(auth).send({}).expect(202);
    const spy = new SpyProvider();
    await processAnalysis(created.body.data.id, undefined, spy);

    const seen = JSON.stringify(spy.transcript);
    expect(seen).toContain('[PERSON_1]');
    expect(seen).not.toContain('Aysel');
    expect(seen).toContain('<workbook_data>');

    const analysis = await prisma.analysis.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(analysis.verification).toMatchObject({ unverified: ['999,999'] });
    expect(JSON.stringify(analysis.result)).toMatch(/999,999.*could not be verified/);
  });

  it('rejects analyses of files that are not ready and hides other users’ analyses', async () => {
    const owner = await userWithToken(app);
    const other = await userWithToken(app);
    const { body } = await request(app)
      .post('/api/files')
      .set(owner.auth)
      .attach('file', await messyWorkbook(), 'q1.xlsx');
    await request(app).post(`/api/files/${body.data.id}/analyses`).set(owner.auth).send({}).expect(409);

    await processIngest(body.data.id);
    const created = await request(app)
      .post(`/api/files/${body.data.id}/analyses`)
      .set(owner.auth)
      .send({})
      .expect(202);
    await request(app).get(`/api/analyses/${created.body.data.id}`).set(other.auth).expect(404);
    await request(app).post(`/api/files/${body.data.id}/analyses`).set(other.auth).send({}).expect(404);
    await request(app)
      .post(`/api/files/${body.data.id}/analyses`)
      .set(owner.auth)
      .send({ language: 'fr' })
      .expect(422);
  });

  it('records failures with a safe message', async () => {
    const { auth } = await userWithToken(app);
    const fileId = await readyFile(auth);
    const created = await request(app).post(`/api/files/${fileId}/analyses`).set(auth).send({}).expect(202);
    await failAnalysis(created.body.data.id, new Error('db password is hunter2'));
    const res = await request(app).get(`/api/analyses/${created.body.data.id}`).set(auth).expect(200);
    expect(res.body.data).toMatchObject({
      status: 'FAILED',
      error: { code: 'ANALYSIS_FAILED', message: 'The analysis could not be completed' },
    });
  });
});
