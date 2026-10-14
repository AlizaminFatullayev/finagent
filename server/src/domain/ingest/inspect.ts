import { extname } from 'node:path';
import yauzl from 'yauzl';
import { AppError, PayloadTooLargeError } from '../../lib/errors.js';

export type FileKind = 'xlsx' | 'csv';

export type UploadLimits = { maxUncompressedBytes: number; maxSheets: number };

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MIME: Record<FileKind, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};

const rejected = (message: string) => new AppError(400, 'UNSUPPORTED_FILE', message);

/** Lists zip entries from the central directory without decompressing anything. */
function zipEntries(buffer: Buffer): Promise<{ name: string; size: number }[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('Unreadable zip'));
      const entries: { name: string; size: number }[] = [];
      zip.on('entry', (entry: yauzl.Entry) => {
        entries.push({ name: entry.fileName, size: entry.uncompressedSize });
        zip.readEntry();
      });
      zip.on('end', () => resolve(entries));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

/**
 * Decides whether an upload is really what its extension claims, judging by content
 * (magic bytes, zip structure, encoding), and rejects zip bombs before any parsing.
 */
export async function inspectUpload(buffer: Buffer, originalName: string, limits: UploadLimits) {
  const ext = extname(originalName).toLowerCase();

  if (ext === '.xlsx') {
    if (!buffer.subarray(0, 4).equals(ZIP_MAGIC))
      throw rejected('File content is not a valid .xlsx workbook');
    const entries = await zipEntries(buffer).catch(() => {
      throw rejected('File content is not a valid .xlsx workbook');
    });
    // Any zip is "PK"; a real workbook must contain the workbook part.
    if (!entries.some((e) => e.name === 'xl/workbook.xml'))
      throw rejected('Zip archive is not an Excel workbook');
    // Declared sizes are checked before anything is decompressed; the parser's row limit backs this up.
    const uncompressed = entries.reduce((sum, e) => sum + e.size, 0);
    if (uncompressed > limits.maxUncompressedBytes) {
      throw new PayloadTooLargeError('Workbook expands beyond the allowed uncompressed size');
    }
    const sheets = entries.filter((e) => /^xl\/worksheets\/[^/]+\.xml$/.test(e.name)).length;
    if (sheets > limits.maxSheets) throw rejected(`Workbook has more than ${limits.maxSheets} sheets`);
    return { kind: 'xlsx' as const, mimeType: MIME.xlsx };
  }

  if (ext === '.csv') {
    if (buffer.subarray(0, 4).equals(ZIP_MAGIC) || buffer.includes(0))
      throw rejected('File content is not text CSV');
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw rejected('CSV files must be UTF-8 encoded');
    }
    return { kind: 'csv' as const, mimeType: MIME.csv };
  }

  throw rejected('Only .xlsx and .csv files are accepted');
}
