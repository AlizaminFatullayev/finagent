import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildSampleWorkbook, sampleSensitiveValues } from '../../scripts/sampleWorkbook.js';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { AnthropicProvider } from '../../src/domain/agent/llm/anthropic.js';
import { SummarySchema } from '../../src/domain/agent/schemas.js';
import { prisma } from '../../src/lib/prisma.js';
import { failAnalysis, processAnalysis } from '../../src/queue/processors/analyze.js';
import { processIngest } from '../../src/queue/processors/ingest.js';
import { userWithToken } from '../factories.js';
import { resetState } from '../helpers.js';

const enabled = process.env.LIVE_LLM_TEST === '1' && Boolean(env.ANTHROPIC_API_KEY);
const KNOWN_FAILURES = ['LLM_REFUSED', 'LLM_TIMEOUT', 'LLM_ERROR', 'AGENT_FAILED'];

/**
 * Status, error.type and a truncated error.message from an error response. Nothing from the
 * request is included, and anything shaped like an API key is masked in case a provider echoes it.
 */
async function sanitizedError(res: Response) {
  let type = 'unknown';
  let message: string;
  try {
    const body = (await res.clone().json()) as { error?: { type?: unknown; message?: unknown } };
    type = String(body.error?.type ?? 'unknown');
    message = String(body.error?.message ?? '');
  } catch {
    message = '(non-JSON error body)';
  }
  message = message.replace(/\b(sk|key)[-_][A-Za-z0-9_-]{8,}/gi, '[REDACTED]').slice(0, 300);
  return `HTTP ${res.status} ${type}: ${message}`;
}

describe.skipIf(!enabled)('live LLM provider on the synthetic sample (opt-in)', () => {
  beforeAll(resetState);

  it('summarises masked data only and records usage and verification', async () => {
    const app = createApp();
    // Synthetic sample only: this is the one test that sends data to the real API.
    const workbook = await buildSampleWorkbook();
    const forbidden = await sampleSensitiveValues(workbook);

    // Every request body is kept in memory for the scan below and never printed.
    const payloads: string[] = [];
    // The provider maps HTTP errors to fixed messages, so the raw error is read here for the report only.
    const providerErrors: string[] = [];
    const capturingFetch: typeof fetch = async (input, init) => {
      if (typeof init?.body === 'string') payloads.push(init.body);
      const res = await fetch(input, init);
      if (!res.ok) providerErrors.push(await sanitizedError(res));
      return res;
    };
    const provider = new AnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY!,
      model: env.LLM_MODEL,
      timeoutMs: env.LLM_TIMEOUT_MS,
      maxRetries: env.LLM_MAX_RETRIES,
      fetch: capturingFetch,
    });

    const { auth } = await userWithToken(app);
    const upload = await request(app).post('/api/files').set(auth).attach('file', workbook, 'synthetic.xlsx');
    await processIngest(upload.body.data.id);
    const created = await request(app).post(`/api/files/${upload.body.data.id}/analyses`).set(auth).send({});
    const id = created.body.data.id as string;

    // Same handling as the worker: a refusal or provider error ends in the documented FAILED state.
    let thrown: unknown;
    await processAnalysis(id, undefined, provider).catch(async (err) => {
      thrown = err;
      await failAnalysis(id, err);
    });
    const res = await request(app).get(`/api/analyses/${id}`).set(auth).expect(200);
    const analysis = res.body.data;

    const leaks = forbidden.filter((v) => payloads.some((p) => p.includes(v)));
    const distinctRequests = new Set(payloads).size;
    const report = [
      `model:              ${env.LLM_MODEL}`,
      `status:             ${analysis.status}${analysis.error ? ` (${analysis.error.code})` : ''}`,
      `requests sent:      ${payloads.length} (${distinctRequests} distinct, limit ${env.AGENT_MAX_ITERATIONS})`,
      `token usage:        ${JSON.stringify(analysis.tokenUsage)}`,
      `verification:       ${JSON.stringify(analysis.verification && { checked: analysis.verification.checked, verified: analysis.verification.verified })}`,
      `payload PII scan:   ${forbidden.length} sensitive values, ${leaks.length} found in outbound payloads`,
      ...providerErrors.map((e, i) => `provider error ${i + 1}:   ${e}`),
    ];
    console.log(`\nLIVE LLM TEST REPORT\n${report.join('\n')}\n`);

    expect(payloads.length).toBeGreaterThan(0);
    expect(leaks).toEqual([]);
    expect(payloads.some((p) => p.includes('[PERSON_'))).toBe(true);
    expect(distinctRequests).toBeLessThanOrEqual(env.AGENT_MAX_ITERATIONS);

    if (analysis.status === 'FAILED') {
      console.log(`RESULT: provider did not complete (${analysis.error.code}); FAILED state verified.`);
      expect(KNOWN_FAILURES).toContain(analysis.error.code);
      expect(thrown).toBeDefined();
      return;
    }
    expect(analysis.status).toBe('COMPLETED');
    expect(SummarySchema.safeParse(analysis.result.summary).success).toBe(true);
    expect(analysis.tokenUsage.inputTokens).toBeGreaterThan(0);
    expect(analysis.tokenUsage.outputTokens).toBeGreaterThan(0);
    const stored = await prisma.analysis.findUniqueOrThrow({ where: { id } });
    expect(stored.verification).toMatchObject({ checked: expect.any(Number) });
    console.log('RESULT: PASS');
  });
});
