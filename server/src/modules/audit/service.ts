import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { newestFirst, pageArgs, toPage, type PaginationQuery } from '../../lib/pagination.js';

export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.refresh_reuse'
  | 'user.create'
  | 'user.role_change'
  | 'file.upload'
  | 'file.view'
  | 'file.delete'
  | 'analysis.run'
  | 'report.export'
  | 'pii.unmask'
  | 'webhook.create'
  | 'webhook.delete';

/** Who did it and from where; captured once per request. */
export type AuditContext = { actorId: string | null; ip: string | null; userAgent: string | null };

export function auditContext(req: Request): AuditContext {
  return { actorId: req.user?.id ?? null, ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

export type AuditEntry = {
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Appends an audit entry. Pass the transaction client when the audited action changes data,
 * so the change and its audit record commit or roll back together.
 */
export async function recordAudit(ctx: AuditContext, entry: AuditEntry, db: Tx | typeof prisma = prisma) {
  await db.auditLog.create({ data: { ...ctx, ...entry } });
}

export type AuditQuery = PaginationQuery & { actorId?: string; action?: string; from?: Date; to?: Date };

export async function listAuditLogs(query: AuditQuery) {
  const rows = await prisma.auditLog.findMany({
    where: {
      actorId: query.actorId,
      action: query.action,
      createdAt: { gte: query.from, lte: query.to },
    },
    orderBy: newestFirst,
    ...pageArgs(query),
  });
  return toPage(rows, query.limit);
}
