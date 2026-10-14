import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

/** Resolves the bearer token to an active user. Shared with the Socket.IO handshake. */
export async function userFromToken(token: string | undefined) {
  if (!token) throw new UnauthorizedError();
  const userId = await verifyAccessToken(token).catch(() => {
    throw new UnauthorizedError('Invalid or expired access token');
  });
  // Role and status come from the database, not the token, so deactivation and role
  // changes take effect immediately instead of when the token expires.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (!user?.isActive) throw new UnauthorizedError('Account is not active');
  return { id: user.id, email: user.email, role: user.role };
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  req.user = await userFromToken(token);
  next();
};
