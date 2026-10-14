import { Readable } from 'node:stream';
import { buffer as readAll } from 'node:stream/consumers';
import ExcelJS from 'exceljs';
import type { RawRow, RawSheet } from './schema.js';
import { normalizeCell, type Cell } from './values.js';

/** A problem with the file's content. Its message is safe to show to the uploader. */
export class IngestError extends Error {}

export type ParseLimits = { maxSheets: number; maxRows: number };

/**
 * Reads an xlsx workbook with exceljs's full reader.
 * shortcut: the workbook is loaded in memory instead of streamed. exceljs 4.4's streaming reader
 * silently drops sheets and sheet names depending on zip entry order and stream chunking, which is
 * data loss; memory here is bounded by UPLOAD_MAX_BYTES / UPLOAD_MAX_UNCOMPRESSED_BYTES checked at
 * upload. Revisit with a fixed streaming parser if files beyond those limits must be supported.
 */
export async function parseXlsx(input: Readable, limits: ParseLimits): Promise<RawSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(input).catch(() => {
    throw new IngestError('The workbook could not be read. Is it a valid .xlsx file?');
  });
  if (workbook.worksheets.length === 0) throw new IngestError('Workbook contains no sheets');
  if (workbook.worksheets.length > limits.maxSheets) {
    throw new IngestError(`Workbook has more than ${limits.maxSheets} sheets`);
  }
  const totalRows = workbook.worksheets.reduce((sum, ws) => sum + ws.actualRowCount, 0);
  if (totalRows > limits.maxRows) throw new IngestError(`Workbook has more than ${limits.maxRows} rows`);

  return workbook.worksheets.map((ws) => {
    const rows: RawRow[] = [];
    ws.eachRow((row) => {
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        // exceljs repeats a merged range's value in every covered cell; keeping it only in the
        // top-left cell stops a merged title from looking like a full-width header row.
        cells[col - 1] = cell.isMerged && cell.master !== cell ? null : normalizeCell(cell.value);
      });
      rows.push({ rowNumber: row.number, cells: Array.from(cells, (c) => c ?? null) });
    });
    return { name: ws.name, rows };
  });
}

/**
 * Parses CSV with exceljs's RFC 4180 parser but keeps every value a string: its default
 * auto-conversion would destroy leading zeros in account numbers and IDs. Type inference
 * decides later what is numeric.
 */
export async function parseCsv(input: Readable, limits: ParseLimits): Promise<RawSheet[]> {
  // CSV uploads are capped by UPLOAD_MAX_BYTES, so buffering is bounded.
  const content = await readAll(input);
  // European Excel exports use semicolons because the comma is the decimal separator.
  const firstLine = content.subarray(0, 4096).toString('utf8').split(/\r?\n/)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const workbook = new ExcelJS.Workbook();
  const worksheet = await workbook.csv
    .read(Readable.from(content), {
      map: (value: unknown) => value,
      // Reading one row past the limit is enough to know the file is too big.
      parserOptions: { delimiter, maxRows: limits.maxRows + 1 },
    })
    .catch(() => {
      throw new IngestError('The CSV file could not be read');
    });
  if (worksheet.rowCount > limits.maxRows) throw new IngestError(`File has more than ${limits.maxRows} rows`);

  const rows: RawRow[] = [];
  worksheet.eachRow((row) => {
    rows.push({
      rowNumber: row.number,
      cells: Array.from((row.values as unknown[]).slice(1), normalizeCell),
    });
  });
  return [{ name: 'Sheet1', rows }];
}
