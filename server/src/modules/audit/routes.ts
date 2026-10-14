import { Router } from 'express';
import { z } from 'zod';
import { bearer, envelope, errors, json, registry } from '../../lib/openapi.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import { AuditLogListMeta, AuditLogQuery, AuditLogSchema } from './schemas.js';

export const auditRouter = Router();
auditRouter.use(authenticate, requireRole('ADMIN'));

registry.registerPath({
  method: 'get',
  path: '/api/audit-logs',
  tags: ['Audit'],
  summary: 'Search the append-only audit log (admin)',
  security: bearer,
  request: { query: AuditLogQuery },
  responses: { 200: json(envelope(z.array(AuditLogSchema), AuditLogListMeta)), ...errors(401, 403, 422) },
});
auditRouter.get('/', validate({ query: AuditLogQuery }), controller.list);
