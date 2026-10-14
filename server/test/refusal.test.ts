import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { MockProvider } from '../src/domain/agent/llm/mock.js';
import type { LLMProvider, LLMResponse } from '../src/domain/agent/llm/types.js';
import { prisma } from '../src/lib/prisma.js';
import { createRedis } from '../src/lib/redis.js';
import { failAnalysis, isPermanent, processAnalysis } from '../src/queue/processors/analyze.js';
import { processIngest } from '../src/queue/processors/ingest.js';
import { EVENTS_CHANNEL } from '../src/realtime/events.js';
import { userWithToken } from './factories.js';
import { messyWorkbook } from './fixtures.js';
import { resetState } from './helpers.js';

const app = createApp();
const REFUSED = { code: 'LLM_REFUSED', message: 'The language model declined to process this request.' };

/** Refuses every request; its text echoes file data to prove none of it is ever surfaced. */
class RefusingProvider implements LLMProvider {
  readonly name = 'scripted';
  calls = 0;
  constructor(readonly model: string) {}
  async complete(): Promise<LLMResponse> {
    this.calls += 1;
    return {
      text: 'I cannot help with Aysel Mammadova [PERSON_1]',
      toolCalls: [],
      stopReason: 'refusal',
      usage: { inputTokens: 1, outputTokens: 1 },
      model: this.model,
    };
  }
}

async function queuedAnalysis() {
  const owner = await userWithToken(app);
  const admin = await userWithToken(app, 'ADMIN');
  await request(app)
    .post('/api/webhooks')
    .set(admin.auth)
    .send({ url: 'https://93.184.215.14/hook', events: ['analysis.failed'] })
    .expect(201);
  const { body } = await request(app)
    .post('/api/files')
    .set(owner.auth)
    .attach('file', await messyWorkbook(), 'q1.xlsx');
  await processIngest(body.data.id);
  const created = await request(app).post(`/api/files/${body.data.id}/analyses`).set(owner.auth).send({});
  return { owner, fileId: body.data.id as string, analysisId: created.body.data.id as string };
}

/** Runs the job the way the worker does: a permanent error fails the analysis at once. */
async function runJob(id: string, provider: LLMProvider, fallback: (model: string) => LLMProvider) {
  await processAnalysis(id, undefined, provider, fallback).catch(async (err) => {
    expect(isPermanent(err)).toBe(true);
    await failAnalysis(id, err);
  });
}

describe('LLM refusals', () => {
  const events: { event: string; payload: Record<string, unknown> }[] = [];
  const subscriber = createRedis();
  subscriber.on('message', (_channel, message: string) => events.push(JSON.parse(message)));

  beforeEach(async () => {
    await resetState();
    events.length = 0;
    await subscriber.subscribe(EVENTS_CHANNEL);
  });
  afterEach(() => {
    env.LLM_REFUSAL_FALLBACK_MODEL = undefined;
  });

  it('fails with LLM_REFUSED, a generic message, an audit entry, a socket event and a webhook payload', async () => {
    const { owner, fileId, analysisId } = await queuedAnalysis();
    const fallbacks: string[] = [];
    await runJob(analysisId, new RefusingProvider('primary-1'), (m) => {
      fallbacks.push(m);
      return new MockProvider();
    });
    // Fallback is off by default.
    expect(fallbacks).toEqual([]);

    const res = await request(app).get(`/api/analyses/${analysisId}`).set(owner.auth).expect(200);
    expect(res.body.data).toMatchObject({ status: 'FAILED', error: REFUSED, result: null });
    expect(JSON.stringify(res.body)).not.toMatch(/Aysel|PERSON_|cannot help/);

    const stored = await prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } });
    expect(stored).toMatchObject({ errorCode: 'LLM_REFUSED', error: REFUSED.message });
    // Not cached: an identical request is queued again instead of being served the failure.
    await request(app).post(`/api/files/${fileId}/analyses`).set(owner.auth).send({}).expect(202);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'analysis.llm_refused' } });
    expect(audit).toMatchObject({
      actorId: owner.user.id,
      resourceId: analysisId,
      metadata: { fileId, provider: 'scripted', model: 'primary-1' },
    });

    await expect.poll(() => events.find((e) => e.event === 'analysis:failed')).toBeDefined();
    expect(events.find((e) => e.event === 'analysis:failed')!.payload).toEqual({
      analysisId,
      fileId,
      error: REFUSED,
    });
    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { event: 'analysis.failed' } });
    expect(delivery.payload).toMatchObject({ data: { analysisId, fileId, error: REFUSED } });
  });

  it('uses a configured fallback model exactly once and audits the switch', async () => {
    env.LLM_REFUSAL_FALLBACK_MODEL = 'fallback-model-1';
    const { owner, fileId, analysisId } = await queuedAnalysis();
    const fallbacks: string[] = [];
    await runJob(analysisId, new RefusingProvider('primary-1'), (m) => {
      fallbacks.push(m);
      return new MockProvider();
    });
    expect(fallbacks).toEqual(['fallback-model-1']);

    const res = await request(app).get(`/api/analyses/${analysisId}`).set(owner.auth).expect(200);
    expect(res.body.data).toMatchObject({
      status: 'COMPLETED',
      error: null,
      model: 'mock-summarizer-1',
      result: { fallbackFrom: 'primary-1' },
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'analysis.llm_fallback' } });
    expect(audit).toMatchObject({
      actorId: owner.user.id,
      resourceId: analysisId,
      metadata: { fileId, from: 'primary-1', to: 'fallback-model-1' },
    });
  });

  it('fails without looping when the fallback model refuses too', async () => {
    env.LLM_REFUSAL_FALLBACK_MODEL = 'fallback-model-1';
    const { analysisId } = await queuedAnalysis();
    const primary = new RefusingProvider('primary-1');
    const fallback = new RefusingProvider('fallback-model-1');
    await runJob(analysisId, primary, () => fallback);

    expect([primary.calls, fallback.calls]).toEqual([1, 1]);
    expect(await prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } })).toMatchObject({
      status: 'FAILED',
      errorCode: 'LLM_REFUSED',
    });
    expect(await prisma.auditLog.count({ where: { action: 'analysis.llm_fallback' } })).toBe(1);
    const refused = await prisma.auditLog.findFirstOrThrow({ where: { action: 'analysis.llm_refused' } });
    expect(refused.metadata).toMatchObject({ model: 'fallback-model-1' });
  });
});
