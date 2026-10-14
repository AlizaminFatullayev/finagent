import { env } from '../../config/env.js';
import { CHARTS_VERSION, SheetChartBuilder, type ChartSpec } from '../../domain/analysis/charts.js';
import { ALGORITHM_VERSION } from '../../domain/analysis/engine.js';
import type { SheetStats } from '../../domain/analysis/stats.js';
import type { Anomaly } from '../../domain/analysis/types.js';
import type { ColumnSchema } from '../../domain/ingest/schema.js';
import type { Cell } from '../../domain/ingest/values.js';
import { Masker } from '../../domain/privacy/masker.js';
import { loadVault } from '../../domain/privacy/vault.js';
import { sha256 } from '../../lib/crypto.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { newestFirst, pageArgs, toPage, type PaginationQuery } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { analyzeQueue } from '../../queue/queues.js';
import { recordAudit, type AuditContext } from '../audit/service.js';
import { findAccessibleFile, visibleTo } from '../files/service.js';
import { analysisSelect, type ChartsQuery, type CreateAnalysisBody } from './schemas.js';

type Actor = { id: string; role: 'ANALYST' | 'MANAGER' | 'ADMIN' };

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const cacheRedisKey = (cacheKey: string) => `analysis-cache:${cacheKey}`;
// fileId is part of the key because chart specs carry sheet ids, which differ between uploads of the same bytes.
const chartsRedisKey = (cacheKey: string, fileId: string) => `charts:${CHARTS_VERSION}:${cacheKey}:${fileId}`;
const ROW_BATCH = 5_000;

/**
 * Same bytes + same request + same algorithm + same model = same answer. Bumping
 * ALGORITHM_VERSION (or changing model or threshold) produces new keys, which is the
 * invalidation rule: old entries simply stop matching and expire.
 */
export function computeCacheKey(fileSha256: string, params: CreateAnalysisBody) {
  return sha256(
    JSON.stringify({
      file: fileSha256,
      language: params.language,
      focusColumns: [...params.focusColumns].sort(),
      algorithm: ALGORITHM_VERSION,
      provider: env.LLM_PROVIDER,
      model: env.LLM_PROVIDER === 'mock' ? 'mock' : env.LLM_MODEL,
      threshold: env.ANOMALY_THRESHOLD_AMOUNT,
    }),
  );
}

/** Looks up a reusable completed analysis: Redis first (fast path), then the indexed DB column. */
async function findCached(cacheKey: string) {
  const id = await redis.get(cacheRedisKey(cacheKey));
  const where = id
    ? { id, cacheKey, status: 'COMPLETED' as const }
    : { cacheKey, status: 'COMPLETED' as const };
  return prisma.analysis.findFirst({ where, orderBy: { completedAt: 'desc' } });
}

export async function createAnalysis(
  user: Actor,
  fileId: string,
  params: CreateAnalysisBody,
  ctx: AuditContext,
) {
  const file = await findAccessibleFile(user, fileId);
  if (file.status !== 'READY')
    throw new ConflictError(`File is not ready for analysis (status ${file.status})`);

  const cacheKey = computeCacheKey(file.sha256, params);
  const cached = await findCached(cacheKey);

  const analysis = await prisma.$transaction(async (tx) => {
    const created = await tx.analysis.create({
      data: {
        fileId,
        requestedById: user.id,
        params,
        language: params.language,
        cacheKey,
        // A cache hit is recorded as its own completed analysis, so history and audit stay per request.
        ...(cached
          ? {
              status: 'COMPLETED',
              cached: true,
              result: cached.result ?? undefined,
              verification: cached.verification ?? undefined,
              model: cached.model,
              tokenUsage: { inputTokens: 0, outputTokens: 0 },
              startedAt: new Date(),
              completedAt: new Date(),
            }
          : {}),
      },
      select: analysisSelect,
    });
    await recordAudit(
      ctx,
      {
        action: 'analysis.run',
        resourceType: 'analysis',
        resourceId: created.id,
        metadata: { fileId, cached: Boolean(cached) },
      },
      tx,
    );
    return created;
  });

  if (!cached) await analyzeQueue.add('analyze', { analysisId: analysis.id }, { jobId: analysis.id });
  return analysis;
}

export async function rememberInCache(cacheKey: string, analysisId: string) {
  await redis.set(cacheRedisKey(cacheKey), analysisId, 'EX', CACHE_TTL_SECONDS);
}

/** Analyses are visible exactly when their file is visible. */
export async function getAnalysis(user: Actor, analysisId: string) {
  const analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, file: { deletedAt: null, ...visibleTo(user) } },
    select: analysisSelect,
  });
  if (!analysis) throw new NotFoundError('Analysis');
  return analysis;
}

export async function listAnalyses(user: Actor, fileId: string, query: PaginationQuery) {
  await findAccessibleFile(user, fileId);
  const rows = await prisma.analysis.findMany({
    where: { fileId },
    select: analysisSelect,
    orderBy: newestFirst,
    ...pageArgs(query),
  });
  return toPage(rows, query.limit);
}

/** Builds chart specs from masked rows, streamed per sheet in keyset batches to keep memory flat. */
async function buildCharts(
  fileId: string,
  language: 'az' | 'en',
  result: { stats: SheetStats[]; anomalies: Anomaly[] },
) {
  const masker = Masker.fromTokens(await loadVault(fileId));
  const sheets = await prisma.sheet.findMany({
    where: { fileId },
    orderBy: { position: 'asc' },
    select: { id: true, name: true, position: true, columns: true },
  });
  const charts: ChartSpec[] = [];
  for (const sheet of sheets) {
    const columns = sheet.columns as ColumnSchema[];
    const builder = new SheetChartBuilder(
      { ...sheet, columns },
      result.stats.find((s) => s.sheet === sheet.name),
    );
    for (let cursor = -1; ;) {
      const batch = (await prisma.dataRow.findMany({
        where: { sheetId: sheet.id, rowIndex: { gt: cursor } },
        orderBy: { rowIndex: 'asc' },
        take: ROW_BATCH,
        select: { rowIndex: true, data: true },
      })) as { rowIndex: number; data: Record<string, Cell> }[];
      if (!batch.length) break;
      // Charts only ever see masked values, so labels can carry tokens but never raw PII.
      builder.add(masker.maskRows(batch, columns));
      cursor = batch.at(-1)!.rowIndex;
    }
    charts.push(...builder.finish(result.anomalies, language));
  }
  return charts;
}

/** Ready-to-render chart data, computed in code from the stored rows and cached per content + version. */
export async function getCharts(user: Actor, analysisId: string, query: ChartsQuery) {
  const analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, file: { deletedAt: null, ...visibleTo(user) } },
    select: { fileId: true, status: true, cacheKey: true, language: true, result: true },
  });
  if (!analysis) throw new NotFoundError('Analysis');
  if (analysis.status !== 'COMPLETED' || !analysis.result)
    throw new ConflictError(
      `Charts are available once the analysis is completed (status ${analysis.status})`,
    );
  if (query.sheetId && !(await prisma.sheet.count({ where: { id: query.sheetId, fileId: analysis.fileId } })))
    throw new NotFoundError('Sheet');

  const key = chartsRedisKey(analysis.cacheKey, analysis.fileId);
  const hit = await redis.get(key);
  let charts: ChartSpec[];
  if (hit) charts = JSON.parse(hit) as ChartSpec[];
  else {
    charts = await buildCharts(
      analysis.fileId,
      analysis.language as 'az' | 'en',
      analysis.result as { stats: SheetStats[]; anomalies: Anomaly[] },
    );
    await redis.set(key, JSON.stringify(charts), 'EX', CACHE_TTL_SECONDS);
  }
  return { charts: query.sheetId ? charts.filter((c) => c.sheetId === query.sheetId) : charts };
}
