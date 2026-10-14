import type { Request, RequestHandler } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

/** Route-level guard. Resource ownership is checked separately in services. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    next(roles.includes(req.user.role) ? undefined : new ForbiddenError());
  };
}

/** The authenticated user, for handlers that run after `authenticate`. */
export function currentUser(req: Request) {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

/** Managers and admins see every file; analysts only their own. */
export const canSeeAllFiles = (role: Role) => role === 'MANAGER' || role === 'ADMIN';
