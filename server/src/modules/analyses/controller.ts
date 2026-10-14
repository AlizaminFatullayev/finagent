import type { Request, Response } from 'express';
import { send } from '../../lib/http.js';
import type { PaginationQuery } from '../../lib/pagination.js';
import { currentUser } from '../../middleware/rbac.js';
import { auditContext } from '../audit/service.js';
import * as analysesService from './service.js';

export async function create(req: Request, res: Response) {
  const analysis = await analysesService.createAnalysis(
    currentUser(req),
    String(req.params.id),
    req.body,
    auditContext(req),
  );
  // 201: served from cache and already complete; 202: queued for the worker.
  send(res, analysis, { status: analysis.cached ? 201 : 202 });
}

export async function get(req: Request, res: Response) {
  send(res, await analysesService.getAnalysis(currentUser(req), String(req.params.id)));
}

export async function listForFile(req: Request, res: Response) {
  const page = await analysesService.listAnalyses(
    currentUser(req),
    String(req.params.id),
    req.query as unknown as PaginationQuery,
  );
  send(res, page.items, { meta: { nextCursor: page.nextCursor } });
}
