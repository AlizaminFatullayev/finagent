import type { Request, Response } from 'express';
import { send } from '../../lib/http.js';
import type { PaginationQuery } from '../../lib/pagination.js';
import { auditContext } from '../audit/service.js';
import * as webhooksService from './service.js';

export async function create(req: Request, res: Response) {
  send(res, await webhooksService.createWebhook(req.body, auditContext(req)), { status: 201 });
}

export async function list(req: Request, res: Response) {
  const page = await webhooksService.listWebhooks(req.query as unknown as PaginationQuery);
  send(res, page.items, { meta: { nextCursor: page.nextCursor } });
}

export async function remove(req: Request, res: Response) {
  await webhooksService.deleteWebhook(String(req.params.id), auditContext(req));
  send(res, { deleted: true });
}
