import { Router } from 'express';
import { z } from 'zod';
import { bearer, envelope, errors, json, registry } from '../../lib/openapi.js';
import { authenticate } from '../../middleware/auth.js';
import { analysisLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { FileIdParams } from '../files/schemas.js';
import * as controller from './controller.js';
import {
  AnalysisIdParams,
  AnalysisListMeta,
  AnalysisSchema,
  ChartsQuery,
  ChartsSchema,
  CreateAnalysisBody,
  ListAnalysesQuery,
} from './schemas.js';

/** Routes nested under /api/files/:id */
export const fileAnalysesRouter = Router({ mergeParams: true });
/** Routes under /api/analyses */
export const analysesRouter = Router();
fileAnalysesRouter.use(authenticate);
analysesRouter.use(authenticate);

registry.registerPath({
  method: 'post',
  path: '/api/files/{id}/analyses',
  tags: ['Analyses'],
  summary: 'Start an analysis of a READY file',
  description:
    'Statistics and anomalies are computed in code; the LLM only narrates them from masked data. Identical requests on identical content reuse the earlier result (201, `cached: true`). Otherwise the job is queued (202); follow `analysis:progress` on the socket or poll GET /api/analyses/{id}.',
  security: bearer,
  request: {
    params: FileIdParams,
    body: { content: { 'application/json': { schema: CreateAnalysisBody } } },
  },
  responses: {
    201: json(envelope(AnalysisSchema), 'Served from cache, already completed'),
    202: json(envelope(AnalysisSchema), 'Queued'),
    ...errors(401, 404, 409, 422, 429),
  },
});
fileAnalysesRouter.post(
  '/',
  analysisLimiter,
  validate({ params: FileIdParams, body: CreateAnalysisBody }),
  controller.create,
);

registry.registerPath({
  method: 'get',
  path: '/api/files/{id}/analyses',
  tags: ['Analyses'],
  summary: 'Analyses of a file, newest first (cursor pagination)',
  security: bearer,
  request: { params: FileIdParams, query: ListAnalysesQuery },
  responses: { 200: json(envelope(z.array(AnalysisSchema), AnalysisListMeta)), ...errors(401, 404, 422) },
});
fileAnalysesRouter.get(
  '/',
  validate({ params: FileIdParams, query: ListAnalysesQuery }),
  controller.listForFile,
);

registry.registerPath({
  method: 'get',
  path: '/api/analyses/{id}',
  tags: ['Analyses'],
  summary: 'Analysis status and, once completed, its result',
  security: bearer,
  request: { params: AnalysisIdParams },
  responses: { 200: json(envelope(AnalysisSchema)), ...errors(401, 404, 422) },
});
analysesRouter.get('/:id', validate({ params: AnalysisIdParams }), controller.get);

registry.registerPath({
  method: 'get',
  path: '/api/analyses/{id}/charts',
  tags: ['Analyses'],
  summary: 'Ready-to-render chart specs for a completed analysis',
  description:
    'Computed deterministically in code from the stored rows (never by the LLM): anomalies by type and severity, a time series, ' +
    'histograms of up to 3 numeric columns, top values of up to 2 low-cardinality text columns, activity by hour and missing values per column. ' +
    'Charts whose columns are missing are skipped. Labels come from masked data, so they may be tokens such as `[PERSON_3]` ' +
    '(reveal with POST /api/files/{id}/unmask). Every series has at most 200 points (`meta.truncated` keeps the latest 200). ' +
    'Titles follow the analysis language. Cached per content and chart version.',
  security: bearer,
  request: { params: AnalysisIdParams, query: ChartsQuery },
  responses: { 200: json(envelope(ChartsSchema)), ...errors(401, 404, 409, 422) },
});
analysesRouter.get(
  '/:id/charts',
  validate({ params: AnalysisIdParams, query: ChartsQuery }),
  controller.charts,
);
