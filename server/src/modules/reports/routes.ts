import { Router } from 'express';
import { z } from 'zod';
import { bearer, errors, registry } from '../../lib/openapi.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { AnalysisIdParams } from '../analyses/schemas.js';
import * as controller from './controller.js';
import { ExportQuery } from './schemas.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

registry.registerPath({
  method: 'get',
  path: '/api/analyses/{id}/export',
  tags: ['Reports'],
  summary: 'Download a completed analysis as an Excel or PDF report',
  description:
    'Built on demand. Cells that could be interpreted as formulas are neutralised. Audited as report.export.',
  security: bearer,
  request: { params: AnalysisIdParams, query: ExportQuery },
  responses: {
    200: {
      description: 'Report file',
      content: {
        'application/pdf': { schema: z.string().meta({ format: 'binary' }) },
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
          schema: z.string().meta({ format: 'binary' }),
        },
      },
    },
    ...errors(401, 404, 409, 422),
  },
});
reportsRouter.get(
  '/:id/export',
  validate({ params: AnalysisIdParams, query: ExportQuery }),
  controller.exportAnalysis,
);
