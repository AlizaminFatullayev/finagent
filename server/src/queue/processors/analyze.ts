import { UnrecoverableError } from 'bullmq';
import { env } from '../../config/env.js';
import { createProvider } from '../../domain/agent/llm/index.js';
import { LLMRefusalError } from '../../domain/agent/llm/errors.js';
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
import { recordAudit } from '../../modules/audit/service.js';
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
 * Providers are injectable so tests can script them.
 */
export async function processAnalysis(
  analysisId: string,
  report: StageReporter = () => {},
  provider: LLMProvider = createProvider(),
  fallbackProvider: (model: string) => LLMProvider = createProvider,
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
  const agentInput = { sheets, engine, focusColumns: params.focusColumns };
  const agentOptions = { language: params.language, maxIterations: env.AGENT_MAX_ITERATIONS };
  let run;
  let fallbackFrom: string | null = null;
  try {
    run = await runSummaryAgent(provider, agentInput, agentOptions);
  } catch (err) {
    const to = env.LLM_REFUSAL_FALLBACK_MODEL;
    // Off by default: data only moves to another model when an operator configured one explicitly.
    if (!(err instanceof LLMRefusalError) || !to) throw err;
    await recordAudit(
      { actorId: analysis.requestedById, ip: null, userAgent: null },
      {
        action: 'analysis.llm_fallback',
        resourceType: 'analysis',
        resourceId: analysisId,
        metadata: { fileId: analysis.fileId, provider: err.provider, from: err.model, to },
      },
    );
    fallbackFrom = err.model;
    // Exactly one attempt: a refusal here propagates and fails the analysis, so there is no loop.
    run = await runSummaryAgent(fallbackProvider(to), agentInput, agentOptions);
  }
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
        ...(fallbackFrom ? { fallbackFrom } : {}),
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
 * Only AppError codes and messages are stored; anything else could leak internals.
 */
export async function failAnalysis(analysisId: string, err: unknown) {
  const error =
    err instanceof AppError
      ? { code: err.code, message: err.message }
      : { code: 'ANALYSIS_FAILED', message: 'The analysis could not be completed' };
  const analysis = await prisma.$transaction(async (tx) => {
    const failed = await tx.analysis.update({
      where: { id: analysisId },
      data: { status: 'FAILED', error: error.message, errorCode: error.code, completedAt: new Date() },
      include: { file: { select: { ownerId: true } } },
    });
    // A refusal is a provider decision worth tracing; the entry names the model but holds no content.
    if (err instanceof LLMRefusalError) {
      await recordAudit(
        { actorId: failed.requestedById, ip: null, userAgent: null },
        {
          action: 'analysis.llm_refused',
          resourceType: 'analysis',
          resourceId: analysisId,
          metadata: { fileId: failed.fileId, provider: err.provider, model: err.model },
        },
        tx,
      );
    }
    return failed;
  });
  logger.warn({ err, analysisId }, 'analysis failed');
  await publishEvent('analysis:failed', analysis.file.ownerId, {
    analysisId,
    fileId: analysis.fileId,
    error,
  });
  await dispatchWebhookEvent('analysis.failed', { analysisId, fileId: analysis.fileId, error });
  return analysis;
}

/** Agent misbehaviour and refusals are deterministic enough that retrying would only burn tokens. */
export const isPermanent = (err: unknown) =>
  err instanceof AgentError || err instanceof LLMRefusalError || err instanceof UnrecoverableError;
