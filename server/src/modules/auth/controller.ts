import type { Request, Response } from 'express';
import { send } from '../../lib/http.js';
import { currentUser } from '../../middleware/rbac.js';
import { auditContext } from '../audit/service.js';
import * as authService from './service.js';

export async function login(req: Request, res: Response) {
  send(res, await authService.login(req.body.email, req.body.password, auditContext(req)));
}

export async function refresh(req: Request, res: Response) {
  send(res, await authService.refresh(req.body.refreshToken, auditContext(req)));
}

export async function logout(req: Request, res: Response) {
  await authService.logout(currentUser(req).id, req.body.refreshToken, auditContext(req));
  send(res, { loggedOut: true });
}

export async function me(req: Request, res: Response) {
  send(res, await authService.getProfile(currentUser(req).id));
}
