import type { Request, Response } from 'express';
import { send } from '../../lib/http.js';
import type { PaginationQuery } from '../../lib/pagination.js';
import { currentUser } from '../../middleware/rbac.js';
import { auditContext } from '../audit/service.js';
import type { RowsQuery } from './schemas.js';
import * as filesService from './service.js';

export async function upload(req: Request, res: Response) {
  const { file, deduplicated } = await filesService.uploadFile(currentUser(req), req.file, auditContext(req));
  // 202: accepted for background ingest; 200: nothing new to process.
  send(res, file, { status: deduplicated ? 200 : 202, meta: { deduplicated } });
}

export async function list(req: Request, res: Response) {
  const page = await filesService.listFiles(currentUser(req), req.query as unknown as PaginationQuery);
  send(res, page.items, { meta: { nextCursor: page.nextCursor } });
}

export async function get(req: Request, res: Response) {
  send(res, await filesService.getFile(currentUser(req), String(req.params.id), auditContext(req)));
}

export async function rows(req: Request, res: Response) {
  const query = req.query as unknown as RowsQuery;
  const page = await filesService.getRows(currentUser(req), String(req.params.id), query, auditContext(req));
  send(res, page.items, {
    meta: { sheetId: page.sheetId, nextCursor: page.nextCursor, masked: page.masked },
  });
}

export async function remove(req: Request, res: Response) {
  await filesService.deleteFile(currentUser(req), String(req.params.id), auditContext(req));
  send(res, { deleted: true });
}
