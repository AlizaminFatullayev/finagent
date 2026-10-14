import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../../config/env.js';
import { sha256, randomToken } from '../../lib/crypto.js';
import { TooManyRequestsError, UnauthorizedError } from '../../lib/errors.js';
import { signAccessToken } from '../../lib/jwt.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { recordAudit, type AuditContext } from '../audit/service.js';
import { publicUserSelect } from '../users/schemas.js';

// Verifying against a throwaway hash when the email is unknown keeps response time uniform,
// so timing does not reveal which emails have accounts.
const dummyHash = argon2.hash(randomToken());

const DAY_MS = 24 * 60 * 60 * 1000;
const invalidCredentials = () => new UnauthorizedError('Invalid email or password');

async function issueTokens(db: Tx, userId: string, familyId: string) {
  const refreshToken = randomToken();
  await db.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    },
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
  return {
    accessToken: await signAccessToken(user),
    refreshToken,
    tokenType: 'Bearer' as const,
    expiresIn: env.ACCESS_TOKEN_TTL,
    user,
  };
}

export async function login(email: string, password: string, ctx: AuditContext) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    await argon2.verify(await dummyHash, password);
    await recordAudit(ctx, {
      action: 'auth.login_failed',
      metadata: { email, reason: 'unknown_or_inactive' },
    });
    throw invalidCredentials();
  }

  const actor = { ...ctx, actorId: user.id };
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAudit(actor, {
      action: 'auth.login_failed',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { reason: 'locked' },
    });
    throw new TooManyRequestsError('Account is temporarily locked after repeated failed logins');
  }

  if (!(await argon2.verify(user.passwordHash, password))) {
    const attempts = user.failedLoginCount + 1;
    const lock = attempts >= env.LOGIN_MAX_ATTEMPTS;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: lock
          ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + env.LOGIN_LOCKOUT_MINUTES * 60_000) }
          : { failedLoginCount: attempts },
      });
      await recordAudit(
        actor,
        {
          action: 'auth.login_failed',
          resourceType: 'user',
          resourceId: user.id,
          metadata: { reason: 'bad_password', attempts, locked: lock },
        },
        tx,
      );
    });
    throw invalidCredentials();
  }

  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await recordAudit(actor, { action: 'auth.login', resourceType: 'user', resourceId: user.id }, tx);
    return issueTokens(tx, user.id, randomUUID());
  });
}

/**
 * Rotates a refresh token: the presented token is revoked and a new one issued in the same family.
 * Presenting an already-revoked token means it was stolen or replayed, so the whole family dies.
 */
export async function refresh(token: string, ctx: AuditContext) {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { isActive: true } } },
  });
  if (!stored) throw new UnauthorizedError('Invalid refresh token');

  if (stored.revokedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordAudit(
        { ...ctx, actorId: stored.userId },
        { action: 'auth.refresh_reuse', resourceType: 'user', resourceId: stored.userId },
        tx,
      );
    });
    throw new UnauthorizedError('Refresh token has already been used');
  }
  if (stored.expiresAt <= new Date() || !stored.user.isActive)
    throw new UnauthorizedError('Refresh token expired');

  return prisma.$transaction(async (tx) => {
    // Conditional revoke: if two requests race with the same token, only one wins the row.
    const { count } = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new UnauthorizedError('Refresh token has already been used');
    return issueTokens(tx, stored.userId, stored.familyId);
  });
}

/** Ends the session that owns this refresh token (its whole rotation family). */
export async function logout(userId: string, token: string, ctx: AuditContext) {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  await prisma.$transaction(async (tx) => {
    // A token belonging to someone else is ignored rather than reported, to avoid an oracle.
    if (stored?.userId === userId) {
      await tx.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await recordAudit(ctx, { action: 'auth.logout', resourceType: 'user', resourceId: userId }, tx);
  });
}

export function getProfile(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
}
