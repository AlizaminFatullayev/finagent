import argon2 from 'argon2';
import { Prisma, type Role } from '../../generated/prisma/client.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { newestFirst, pageArgs, toPage, type PaginationQuery } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { recordAudit, type AuditContext } from '../audit/service.js';
import { publicUserSelect, type CreateUserBody } from './schemas.js';

export async function createUser(input: CreateUserBody, ctx: AuditContext) {
  // argon2id with library defaults (OWASP-recommended memory-hard parameters).
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, role: input.role, passwordHash },
        select: publicUserSelect,
      });
      await recordAudit(
        ctx,
        { action: 'user.create', resourceType: 'user', resourceId: user.id, metadata: { role: user.role } },
        tx,
      );
      return user;
    });
  } catch (err) {
    // Relying on the unique index (not a pre-check) is race-free.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('A user with this email already exists');
    }
    throw err;
  }
}

export async function listUsers(query: PaginationQuery) {
  const rows = await prisma.user.findMany({
    select: publicUserSelect,
    orderBy: newestFirst,
    ...pageArgs(query),
  });
  return toPage(rows, query.limit);
}

export async function changeRole(userId: string, role: Role, ctx: AuditContext) {
  // An admin demoting themselves could leave the bank with no admin at all.
  if (userId === ctx.actorId) throw new ConflictError('You cannot change your own role');
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!before) throw new NotFoundError('User');
    const user = await tx.user.update({ where: { id: userId }, data: { role }, select: publicUserSelect });
    await recordAudit(
      ctx,
      {
        action: 'user.role_change',
        resourceType: 'user',
        resourceId: userId,
        metadata: { from: before.role, to: role },
      },
      tx,
    );
    return user;
  });
}
