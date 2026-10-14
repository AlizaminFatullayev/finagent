import type { Request, Response } from 'express';
import { send } from '../../lib/http.js';
import type { PaginationQuery } from '../../lib/pagination.js';
import { auditContext } from '../audit/service.js';
import * as usersService from './service.js';

export async function create(req: Request, res: Response) {
  send(res, await usersService.createUser(req.body, auditContext(req)), { status: 201 });
}

export async function list(req: Request, res: Response) {
  const query = req.query as unknown as PaginationQuery;
  const page = await usersService.listUsers(query);
  send(res, page.items, { meta: { nextCursor: page.nextCursor } });
}

export async function changeRole(req: Request, res: Response) {
  send(res, await usersService.changeRole(String(req.params.id), req.body.role, auditContext(req)));
}
