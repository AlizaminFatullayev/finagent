import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildXlsx, messyWorkbook } from '../../../test/fixtures.js';
import { inspectUpload } from './inspect.js';
import { IngestError, parseCsv, parseXlsx } from './parser.js';
import { inferSheet, inferType } from './schema.js';

const limits = { maxSheets: 20, maxRows: 10_000 };
const uploadLimits = { maxUncompressedBytes: 50_000_000, maxSheets: 20 };

describe('xlsx parsing and schema inference', () => {
  it('finds a header below a merged title row and skips blank rows', async () => {
    const sheets = await parseXlsx(Readable.from(await messyWorkbook()), limits);
    expect(sheets.map((s) => s.name)).toEqual(['Transactions', 'Summary']);

    const tx = inferSheet(sheets[0]!);
    expect(tx.headerRow).toBe(3);
    expect(tx.columns.map((c) => [c.key, c.type])).toEqual([
      ['txn_id', 'id'],
      ['date', 'date'],
      ['customer', 'text'],
      ['amount', 'currency'],
      ['fee', 'percent'],
      ['approved', 'boolean'],
    ]);
    // Blank row 6 is gone; row indexes are the original worksheet rows.
    expect(tx.rows.map((r) => r.rowIndex)).toEqual([4, 5, 7]);
    // Formula cells keep their cached result.
    expect(tx.rows[2]!.data.amount).toBe(3001);
    expect(tx.rows[1]!.data.date).toBe('2024-01-06T23:10:00.000Z');
  });

  it('enforces the row limit while streaming', async () => {
    const rows = [['A'], ...Array.from({ length: 50 }, (_, i) => [i])];
    const buf = await buildXlsx({ S: rows });
    await expect(parseXlsx(Readable.from(buf), { maxSheets: 5, maxRows: 10 })).rejects.toThrow(IngestError);
  });

  it('rejects corrupt workbooks with a safe message', async () => {
    const corrupt = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(100, 1)]);
    await expect(parseXlsx(Readable.from(corrupt), limits)).rejects.toThrow(/could not be read/);
  });

  it('handles sheets without a header and duplicate header names', () => {
    const noHeader = inferSheet({
      name: 'S',
      rows: [
        { rowNumber: 1, cells: [1, 2] },
        { rowNumber: 2, cells: [3, 4] },
      ],
    });
    expect(noHeader.headerRow).toBe(0);
    expect(noHeader.columns.map((c) => c.name)).toEqual(['Column A', 'Column B']);
    expect(noHeader.rows).toHaveLength(2);

    const dupes = inferSheet({
      name: 'S',
      rows: [
        { rowNumber: 1, cells: ['Amount', 'Amount', 'Məbləğ'] },
        { rowNumber: 2, cells: [1, 2, 3] },
        { rowNumber: 3, cells: ['Amount', 'Amount', 'Məbləğ'] },
      ],
    });
    expect(dupes.columns.map((c) => c.key)).toEqual(['amount', 'amount_2', 'mebleg']);
    expect(dupes.columns.map((c) => c.name)).toEqual(['Amount', 'Amount 2', 'Məbləğ']);
    // The repeated header row (page break in an export) is not treated as data.
    expect(dupes.rows).toHaveLength(1);
  });

  it('tolerates a few dirty values and reports null ratios', () => {
    expect(inferType('Balance', [1, 2, 3, 4, 5, 6, 7, 8, 9, 'n/a'])).toBe('currency');
    expect(inferType('Notes', [1, 'a', 'b', 'c'])).toBe('text');
    expect(inferType('Account No', ['0012', '0013', '0014'])).toBe('id');
    const sheet = inferSheet({
      name: 'S',
      rows: [
        { rowNumber: 1, cells: ['Name', 'Score'] },
        { rowNumber: 2, cells: ['a', 1] },
        { rowNumber: 3, cells: ['b', null] },
      ],
    });
    expect(sheet.columns[1]).toMatchObject({ type: 'number', nullRatio: 0.5, distinctCount: 1 });
  });
});

describe('csv parsing', () => {
  it('detects semicolons and keeps leading zeros', async () => {
    const csv = 'Hesab;Məbləğ;Tarix\n0012345;1 250,50;05.03.2024\n0099999;"3,5";06.03.2024\n';
    const [sheet] = await parseCsv(Readable.from(Buffer.from(csv)), limits);
    const inferred = inferSheet(sheet!);
    expect(inferred.rows[0]!.data.hesab).toBe('0012345');
    expect(inferred.columns.map((c) => c.type)).toEqual(['id', 'currency', 'date']);
  });
});

describe('upload inspection', () => {
  it('accepts a real workbook', async () => {
    await expect(inspectUpload(await messyWorkbook(), 'q1.xlsx', uploadLimits)).resolves.toMatchObject({
      kind: 'xlsx',
    });
  });

  it('rejects a text file renamed to .xlsx and unknown extensions', async () => {
    await expect(inspectUpload(Buffer.from('a,b\n1,2'), 'fake.xlsx', uploadLimits)).rejects.toThrow(
      /not a valid .xlsx/,
    );
    await expect(inspectUpload(Buffer.from('x'), 'macro.xlsm', uploadLimits)).rejects.toThrow(
      /Only .xlsx and .csv/,
    );
  });

  it('rejects binary content posing as CSV', async () => {
    await expect(inspectUpload(await messyWorkbook(), 'data.csv', uploadLimits)).rejects.toThrow(
      /not text CSV/,
    );
    await expect(inspectUpload(Buffer.from([0xff, 0xfe, 0x41]), 'data.csv', uploadLimits)).rejects.toThrow(
      /UTF-8/,
    );
  });

  it('rejects workbooks that decompress beyond the limit (zip bomb guard)', async () => {
    // Highly repetitive content compresses to almost nothing but expands far beyond the tiny limit.
    const bomb = await buildXlsx({ S: Array.from({ length: 2_000 }, () => ['x'.repeat(200)]) });
    expect(bomb.length).toBeLessThan(60_000);
    await expect(
      inspectUpload(bomb, 'bomb.xlsx', { maxUncompressedBytes: 100_000, maxSheets: 20 }),
    ).rejects.toThrow(/uncompressed size/);
  });

  it('enforces the sheet limit from the zip directory', async () => {
    const many = await buildXlsx({ A: [['x']], B: [['y']], C: [['z']] });
    await expect(
      inspectUpload(many, 'many.xlsx', { maxUncompressedBytes: 50_000_000, maxSheets: 2 }),
    ).rejects.toThrow(/more than 2 sheets/);
  });
});
