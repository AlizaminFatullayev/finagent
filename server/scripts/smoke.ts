import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { buildSampleWorkbook } from './sampleWorkbook.js';

/**
 * End-to-end check against a running API + worker: log in, upload the synthetic sample, wait
 * for ingest, run an analysis, fetch its charts, reveal one masked token and download both report
 * formats. Exits non-zero on any failure.
 * Use with LLM_PROVIDER=mock on the server to avoid LLM cost.
 */
const rootEnv = new URL('../../.env', import.meta.url);
const fileEnv = existsSync(rootEnv) ? parseEnv(readFileSync(rootEnv, 'utf8')) : {};
const setting = (key: string, fallback?: string) => process.env[key] ?? fileEnv[key] ?? fallback;

const base = setting('SMOKE_API_URL', `http://localhost:${setting('PORT', '3000')}`)!;
const email = setting('SEED_ANALYST_EMAIL');
const password = setting('SEED_ANALYST_PASSWORD');
const TIMEOUT_MS = 120_000;

let failed = false;
const step = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  const started = Date.now();
  try {
    const result = await fn();
    console.log(`PASS  ${name} (${Date.now() - started} ms)`);
    return result;
  } catch (err) {
    failed = true;
    console.log(`FAIL  ${name}: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
};

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res;
}

async function waitFor<T>(what: string, poll: () => Promise<T | undefined>) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await poll();
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`timed out waiting for ${what}`);
}

try {
  if (!email || !password)
    throw new Error('SEED_ANALYST_EMAIL / SEED_ANALYST_PASSWORD are not set; run db:seed first');
  await step('API is ready', () => api('/ready'));
  const token = await step('log in as seeded analyst', async () => {
    const res = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
  });

  const fileId = await step('upload synthetic sample', async () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(await buildSampleWorkbook())]),
      'synthetic-bank-transactions.xlsx',
    );
    const res = await api('/api/files', { method: 'POST', body: form, token });
    return ((await res.json()) as { data: { id: string } }).data.id;
  });

  await step('worker ingests the file', () =>
    waitFor('ingest', async () => {
      const res = await api(`/api/files/${fileId}`, { token });
      const { data } = (await res.json()) as { data: { status: string; errorMessage: string | null } };
      if (data.status === 'FAILED') throw new Error(`ingest failed: ${data.errorMessage}`);
      return data.status === 'READY' ? true : undefined;
    }),
  );

  const analysisId = await step('request analysis', async () => {
    const res = await api(`/api/files/${fileId}/analyses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'en' }),
      token,
    });
    return ((await res.json()) as { data: { id: string } }).data.id;
  });

  await step('analysis completes', () =>
    waitFor('analysis', async () => {
      const res = await api(`/api/analyses/${analysisId}`, { token });
      const { data } = (await res.json()) as {
        data: { status: string; error: string | null; result: { anomalies: unknown[] } };
      };
      if (data.status === 'FAILED') throw new Error(`analysis failed: ${data.error}`);
      if (data.status !== 'COMPLETED') return undefined;
      console.log(`      ${data.result.anomalies.length} anomalies detected`);
      return true;
    }),
  );

  await step('chart data', async () => {
    const res = await api(`/api/analyses/${analysisId}/charts`, { token });
    const { data } = (await res.json()) as { data: { charts: { id: string }[] } };
    if (!data.charts.some((c) => c.id.startsWith('anomalies-by-type:'))) throw new Error('no anomaly chart');
    console.log(`      ${data.charts.length} charts`);
  });

  await step('reveal a masked token', async () => {
    const rows = await api(`/api/files/${fileId}/rows?limit=1`, { token });
    const { data } = (await rows.json()) as { data: { data: Record<string, unknown> }[] };
    const masked = Object.values(data[0]?.data ?? {}).find(
      (v) => typeof v === 'string' && /^\[[A-Z]+_\d+\]$/.test(v),
    );
    if (typeof masked !== 'string') throw new Error('no masked token in the first row');
    const res = await api(`/api/files/${fileId}/unmask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokens: [masked], reason: 'Smoke test of the reveal flow' }),
      token,
    });
    const { data: revealed } = (await res.json()) as { data: { values: Record<string, string> } };
    if (!revealed.values[masked]) throw new Error(`${masked} was not revealed`);
    if (res.headers.get('cache-control') !== 'no-store') throw new Error('missing Cache-Control: no-store');
    // Only the token is printed; the revealed value never goes to the console.
    console.log(`      ${masked} revealed`);
  });

  for (const [format, magic] of [
    ['xlsx', 'PK'],
    ['pdf', '%PDF'],
  ] as const) {
    await step(`download ${format} report`, async () => {
      const res = await api(`/api/analyses/${analysisId}/export?format=${format}`, { token });
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.subarray(0, magic.length).equals(Buffer.from(magic)))
        throw new Error(`not a ${format} file`);
      console.log(`      ${bytes.length} bytes`);
    });
  }
} catch {
  failed = true;
}

console.log(failed ? '\nSMOKE TEST FAILED' : '\nSMOKE TEST PASSED');
process.exit(failed ? 1 : 0);
