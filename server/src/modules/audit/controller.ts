import type { Request, Response } from 'express';
import { send } from '../../lib/http.js';
import { listAuditLogs, type AuditQuery } from './service.js';

export async function list(req: Request, res: Response) {
  const page = await listAuditLogs(req.query as unknown as AuditQuery);
  send(res, page.items, { meta: { nextCursor: page.nextCursor } });
}
