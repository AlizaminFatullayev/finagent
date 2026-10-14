import { UnrecoverableError } from 'bullmq';
import { env } from '../../config/env.js';
import { IngestError, parseCsv, parseXlsx } from '../../domain/ingest/parser.js';
import { inferSheet } from '../../domain/ingest/schema.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { storage } from '../../storage/storage.js';

// Large enough to keep round trips low, small enough to stay under Postgres' 65k bind-parameter limit.
const BATCH_SIZE = 1_000;

export type ProgressReporter = (percent: number) => Promise<void> | void;

/**
 * Parses a stored upload, infers each sheet's schema and saves the rows. Rows and the READY status
 * are written in one transaction, so a file is never READY with half its rows.
 */
export async function processIngest(fileId: string, report: ProgressReporter = () => {}) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  // Deleted while queued: nothing to do, and not an error worth retrying.
  if (!file || file.deletedAt) return;

  await prisma.file.update({ where: { id: fileId }, data: { status: 'PROCESSING', errorMessage: null } });
  await report(5);

  try {
    const limits = { maxSheets: env.UPLOAD_MAX_SHEETS, maxRows: env.UPLOAD_MAX_ROWS };
    const input = await storage.get(file.storedName);
    const rawSheets = file.storedName.endsWith('.csv')
      ? await parseCsv(input, limits)
      : await parseXlsx(input, limits);
    await report(40);

    const sheets = rawSheets.map(inferSheet).filter((s) => s.columns.length > 0);
    if (sheets.length === 0) throw new IngestError('No data was found in the file');

    await prisma.$transaction(
      async (tx) => {
        // A retried job may find rows from an earlier partial attempt; start clean.
        await tx.sheet.deleteMany({ where: { fileId } });
        for (const [position, sheet] of sheets.entries()) {
          const created = await tx.sheet.create({
            data: {
              fileId,
              name: sheet.name,
              position,
              headerRow: sheet.headerRow,
              rowCount: sheet.rows.length,
              columns: sheet.columns,
            },
          });
          for (let i = 0; i < sheet.rows.length; i += BATCH_SIZE) {
            await tx.dataRow.createMany({
              data: sheet.rows.slice(i, i + BATCH_SIZE).map((r) => ({ sheetId: created.id, ...r })),
            });
          }
        }
        await tx.file.update({ where: { id: fileId }, data: { status: 'READY' } });
      },
      { timeout: 5 * 60_000 },
    );
    await report(100);
  } catch (err) {
    // Only IngestError messages are user-facing; anything else may leak internals.
    const message = err instanceof IngestError ? err.message : 'The file could not be processed';
    await prisma.file.update({ where: { id: fileId }, data: { status: 'FAILED', errorMessage: message } });
    logger.warn({ err, fileId }, 'ingest failed');
    // Bad content will fail the same way every time, so retrying only wastes work.
    throw err instanceof IngestError ? new UnrecoverableError(message) : err;
  }
}
