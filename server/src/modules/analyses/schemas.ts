import { z } from 'zod';
import { SummarySchema } from '../../domain/agent/schemas.js';
import { ChartSpecSchema } from '../../domain/analysis/charts.js';
import { PageMeta, PaginationQuery } from '../../lib/pagination.js';

export const CreateAnalysisBody = z.object({
  language: z.enum(['az', 'en']).default('en'),
  focusColumns: z.array(z.string().min(1).max(200)).max(20).default([]),
});
export type CreateAnalysisBody = z.infer<typeof CreateAnalysisBody>;

export const AnalysisIdParams = z.object({ id: z.uuid() });
export const ListAnalysesQuery = PaginationQuery;

export const AnomalySchema = z
  .object({
    id: z.string(),
    ruleId: z.string(),
    type: z.string(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    sheet: z.string(),
    column: z.string().optional(),
    description: z.string(),
    rowIndexes: z.array(z.number().int()),
    affectedCount: z.number().int(),
    metrics: z.record(z.string(), z.union([z.number(), z.string()])),
  })
  .meta({ id: 'Anomaly' });

export const AnalysisResultSchema = z
  .object({
    summary: SummarySchema,
    anomalies: z.array(AnomalySchema),
    severityCounts: z.record(z.string(), z.number()),
    stats: z.array(z.unknown()).meta({ description: 'Per-sheet statistics computed in code' }),
    methodology: z.array(z.object({ ruleId: z.string(), description: z.string() })),
    algorithmVersion: z.string(),
    fallbackFrom: z.string().optional().meta({
      description: 'Set when the primary model refused and LLM_REFUSAL_FALLBACK_MODEL produced the summary',
    }),
  })
  .meta({ id: 'AnalysisResult' });

export const AnalysisErrorSchema = z
  .object({
    code: z.string().meta({
      description: 'Stable code: LLM_REFUSED, LLM_TIMEOUT, LLM_ERROR, AGENT_FAILED or ANALYSIS_FAILED',
      example: 'LLM_REFUSED',
    }),
    message: z.string().meta({ example: 'The language model declined to process this request.' }),
  })
  .meta({ id: 'AnalysisError' });

export const AnalysisSchema = z
  .object({
    id: z.uuid(),
    fileId: z.uuid(),
    requestedById: z.uuid(),
    status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']),
    language: z.enum(['az', 'en']),
    params: z.object({ language: z.string(), focusColumns: z.array(z.string()) }),
    cached: z
      .boolean()
      .meta({ description: 'Result reused from an identical earlier analysis (no LLM cost)' }),
    result: AnalysisResultSchema.nullable(),
    verification: z
      .object({ checked: z.number(), verified: z.number(), unverified: z.array(z.string()) })
      .nullable()
      .meta({ description: 'Numbers in the narrative checked against computed values' }),
    model: z.string().nullable(),
    tokenUsage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
    error: AnalysisErrorSchema.nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'Analysis' });

export const AnalysisListMeta = PageMeta;

export const ChartsQuery = z.object({
  sheetId: z.uuid().optional().meta({ description: 'Only charts of this sheet; defaults to every sheet' }),
});
export type ChartsQuery = z.infer<typeof ChartsQuery>;
export const ChartsSchema = z.object({ charts: z.array(ChartSpecSchema) });

// cacheKey is an internal implementation detail and is not exposed.
export const analysisSelect = {
  id: true,
  fileId: true,
  requestedById: true,
  status: true,
  language: true,
  params: true,
  cached: true,
  result: true,
  verification: true,
  model: true,
  tokenUsage: true,
  error: true,
  errorCode: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
} as const;
