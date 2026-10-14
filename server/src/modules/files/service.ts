import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { env } from '../../config/env.js';
import { inspectUpload } from '../../domain/ingest/inspect.js';
import { sha256 } from '../../lib/crypto.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { newestFirst, pageArgs, toPage, type PaginationQuery } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { canSeeAllFiles } from '../../middleware/rbac.js';
import { ingestQueue } from '../../queue/queues.js';
import { storage } from '../../storage/storage.js';
import { recordAudit, type AuditContext } from '../audit/service.js';
import { fileSelect, type RowsQuery } from './schemas.js';

type Actor = { id: string; role: 'ANALYST' | 'MANAGER' | 'ADMIN' };

/** Row-level access: analysts are scoped to their own files; managers and admins see all. */
export const visibleTo = (user: Actor) => (canSeeAllFiles(user.role) ? {} : { ownerId: user.id });

/**
 * Loads a file the user may see. Files outside the user's scope return 404, not 403,
 * so analysts cannot probe which file ids exist.
 */
export async function findAccessibleFile(user: Actor, fileId: string) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, deletedAt: null, ...visibleTo(user) },
    select: fileSelect,
  });
  if (!file) throw new NotFoundError('File');
  return file;
}

// Strip any client-side path and control characters; the name is display-only.
const displayName = (name: string) =>
  basename(name.replace(/\\/g, '/'))
    // eslint-disable-next-line no-control-regex -- matching control characters is the point here
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 255);

export async function uploadFile(user: Actor, upload: Express.Multer.File | undefined, ctx: AuditContext) {
  if (!upload) throw new ValidationError([{ location: 'body', path: 'file', message: 'A file is required' }]);
  const originalName = displayName(upload.originalname);
  const { kind, mimeType } = await inspectUpload(upload.buffer, originalName, {
    maxUncompressedBytes: env.UPLOAD_MAX_UNCOMPRESSED_BYTES,
    maxSheets: env.UPLOAD_MAX_SHEETS,
  });
  const hash = sha256(upload.buffer);

  // Idempotent upload: the same user re-sending identical bytes gets the existing file back.
  const existing = await prisma.file.findFirst({
    where: { ownerId: user.id, sha256: hash, deletedAt: null },
    select: fileSelect,
  });
  if (existing) return { file: existing, deduplicated: true };

  const storedName = `${randomUUID()}.${kind}`;
  await storage.put(storedName, upload.buffer);
  try {
    const file = await prisma.$transaction(async (tx) => {
      const created = await tx.file.create({
        data: { ownerId: user.id, originalName, storedName, mimeType, sizeBytes: upload.size, sha256: hash },
        select: fileSelect,
      });
      await recordAudit(
        ctx,
        {
          action: 'file.upload',
          resourceType: 'file',
          resourceId: created.id,
          metadata: { originalName, sizeBytes: upload.size },
        },
        tx,
      );
      return created;
    });
    // jobId = fileId makes a duplicate enqueue (e.g. client retry) a no-op in BullMQ.
    await ingestQueue.add('ingest', { fileId: file.id }, { jobId: file.id });
    return { file, deduplicated: false };
  } catch (err) {
    // Do not leave an orphaned blob if the database write failed.
    await storage.delete(storedName);
    throw err;
  }
}

export async function listFiles(user: Actor, query: PaginationQuery) {
  const rows = await prisma.file.findMany({
    where: { deletedAt: null, ...visibleTo(user) },
    select: fileSelect,
    orderBy: newestFirst,
    ...pageArgs(query),
  });
  return toPage(rows, query.limit);
}

export async function getFile(user: Actor, fileId: string, ctx: AuditContext) {
  // One query with a nested select: file plus its sheets, no N+1.
  const file = await prisma.file.findFirst({
    where: { id: fileId, deletedAt: null, ...visibleTo(user) },
    select: {
      ...fileSelect,
      sheets: {
        select: { id: true, name: true, position: true, headerRow: true, rowCount: true, columns: true },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!file) throw new NotFoundError('File');
  await recordAudit(ctx, { action: 'file.view', resourceType: 'file', resourceId: fileId });
  return file;
}

export async function getRows(user: Actor, fileId: string, query: RowsQuery) {
  await findAccessibleFile(user, fileId);
  const sheet = await prisma.sheet.findFirst({
    where: { fileId, ...(query.sheetId ? { id: query.sheetId } : {}) },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  if (!sheet) throw new NotFoundError('Sheet');

  // Keyset pagination on the (sheetId, rowIndex) unique index.
  const rows = await prisma.dataRow.findMany({
    where: { sheetId: sheet.id, ...(query.cursor !== undefined ? { rowIndex: { gt: query.cursor } } : {}) },
    orderBy: { rowIndex: 'asc' },
    take: query.limit + 1,
    select: { rowIndex: true, data: true },
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { sheetId: sheet.id, items, nextCursor: hasMore ? (items.at(-1)?.rowIndex ?? null) : null };
}

export async function deleteFile(user: Actor, fileId: string, ctx: AuditContext) {
  const file = await findAccessibleFile(user, fileId);
  // Managers can read everyone's files but only owners and admins may delete.
  if (file.ownerId !== user.id && user.role !== 'ADMIN') throw new ForbiddenError();
  await prisma.$transaction(async (tx) => {
    // Soft delete keeps the record for audit and retention requirements.
    await tx.file.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
    await recordAudit(ctx, { action: 'file.delete', resourceType: 'file', resourceId: fileId }, tx);
  });
}
