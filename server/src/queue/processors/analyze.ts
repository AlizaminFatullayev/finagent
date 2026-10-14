import { UnrecoverableError } from 'bullmq';
import { env } from '../../config/env.js';
import { createProvider } from '../../domain/agent/llm/index.js';
import type { LLMProvider } from '../../domain/agent/llm/types.js';
import { AgentError, runSummaryAgent } from '../../domain/agent/summaryAgent.js';
import { analyzeWorkbook } from '../../domain/analysis/engine.js';
import type { AnalysisSheet } from '../../domain/analysis/types.js';
import { verifyNumbers } from '../../domain/analysis/verifyNumbers.js';
import type { ColumnSchema } from '../../domain/ingest/schema.js';
import type { Cell } from '../../domain/ingest/values.js';
import { Masker } from '../../domain/privacy/masker.js';
import { loadVault } from '../../domain/privacy/vault.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { rememberInCache } from '../../modules/analyses/service.js';
import { dispatchWebhookEvent } from '../../modules/webhooks/service.js';
import { publishEvent } from '../../realtime/events.js';

export type Stage = 'parsing' | 'analyzing' | 'summarizing' | 'done';
export type StageReporter = (stage: Stage, percent: number) => Promise<void> | void;

/** Loads every sheet with PII already replaced by vault tokens; nothing downstream sees raw values. */
async function loadMaskedSheets(fileId: string): Promise<AnalysisSheet[]> {
  const masker = Masker.fromTokens(await loadVault(fileId));
  // Two queries total (sheets, then all their rows), not one per sheet.
  const sheets = await prisma.sheet.findMany({ where: { fileId }, orderBy: { position: 'asc' } });
  const rows = await prisma.dataRow.findMany({
    where: { sheetId: { in: sheets.map((s) => s.id) } },
    orderBy: [{ sheetId: 'asc' }, { rowIndex: 'asc' }],
    select: { sheetId: true, rowIndex: true, data: true },
  });
  return sheets.map((sheet) => {
    const columns = sheet.columns as ColumnSchema[];
    const own = rows
      .filter((r) => r.sheetId === sheet.id)
      .map((r) => ({ rowIndex: r.rowIndex, data: r.data as Record<string, Cell> }));
    return { name: sheet.name, columns, rows: masker.maskRows(own, columns) };
  });
}

/**
 * Runs one analysis: deterministic engine first, then the LLM narrates the computed facts.
 * The provider is injectable so tests can script it.
 */
export async function processAnalysis(
  analysisId: string,
  report: StageReporter = () => {},
  provider: LLMProvider = createProvider(),
) {
  const analysis = await prisma.analysis.findUnique({ where: { id: analysisId }, include: { file: true } });
  if (!analysis || analysis.status === 'COMPLETED') return;
  const ownerId = analysis.file.ownerId;
  const progress = async (stage: Stage, percent: number) => {
    await report(stage, percent);
    await publishEvent('analysis:progress', ownerId, { analysisId, fileId: analysis.fileId, stage, percent });
  };

  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: 'RUNNING', startedAt: new Date(), error: null },
  });
  await progress('parsing', 10);
  const params = analysis.params as { language: 'az' | 'en'; focusColumns: string[] };
  const sheets = await loadMaskedSheets(analysis.fileId);

  await progress('analyzing', 40);
  const engine = analyzeWorkbook(sheets, { thresholdAmount: env.ANOMALY_THRESHOLD_AMOUNT });

  await progress('summarizing', 60);
  const run = await runSummaryAgent(
    provider,
    { sheets, engine, focusColumns: params.focusColumns },
    { language: params.language, maxIterations: env.AGENT_MAX_ITERATIONS },
  );
  const verification = verifyNumbers(run.summary, run.toolOutputs);
  // Figures the checker could not trace back to computed values are flagged to the reader.
  const caveats = [
    ...run.summary.caveats,
    ...verification.unverified.map((n) =>
      params.language === 'az'
        ? `"${n}" rəqəmi hesablanmış dəyərlərlə təsdiqlənmədi.`
        : `The figure "${n}" could not be verified against computed values.`,
    ),
  ];

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: 'COMPLETED',
      result: {
        summary: { ...run.summary, caveats },
        anomalies: engine.anomalies,
        severityCounts: engine.severityCounts,
        stats: engine.stats,
        methodology: engine.methodology,
        algorithmVersion: engine.algorithmVersion,
      },
      verification,
      model: run.model,
      tokenUsage: run.usage,
      completedAt: new Date(),
    },
  });
  await rememberInCache(analysis.cacheKey, analysisId);
  await progress('done', 100);
  await publishEvent('analysis:completed', ownerId, { analysisId, fileId: analysis.fileId });
  await dispatchWebhookEvent('analysis.completed', { analysisId, fileId: analysis.fileId });
  return { ownerId, fileId: analysis.fileId };
}

/**
 * Records a failure once retries are exhausted (or the error cannot succeed on retry).
 * Only AppError messages are stored; anything else could leak internals.
 */
export async function failAnalysis(analysisId: string, err: unknown) {
  const message = err instanceof AppError ? err.message : 'The analysis could not be completed';
  const analysis = await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: 'FAILED', error: message, completedAt: new Date() },
    include: { file: { select: { ownerId: true } } },
  });
  logger.warn({ err, analysisId }, 'analysis failed');
  await publishEvent('analysis:failed', analysis.file.ownerId, {
    analysisId,
    fileId: analysis.fileId,
    error: message,
  });
  return analysis;
}

/** Agent misbehaviour is deterministic enough that retrying would only burn tokens. */
export const isPermanent = (err: unknown) => err instanceof AgentError || err instanceof UnrecoverableError;
