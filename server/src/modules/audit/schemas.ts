import { z } from 'zod';
import { PageMeta, PaginationQuery } from '../../lib/pagination.js';

export const AuditLogQuery = PaginationQuery.extend({
  actorId: z.uuid().optional(),
  action: z.string().max(64).optional().meta({ example: 'auth.login_failed' }),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const AuditLogSchema = z
  .object({
    id: z.uuid(),
    actorId: z.uuid().nullable(),
    action: z.string(),
    resourceType: z.string().nullable(),
    resourceId: z.string().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    metadata: z.unknown().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'AuditLog' });

export const AuditLogListMeta = PageMeta;
