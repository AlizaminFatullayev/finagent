import { toBoolean, toDate, toNumber, type Cell } from './values.js';

export type ColumnType = 'number' | 'currency' | 'percent' | 'date' | 'boolean' | 'id' | 'text';

export type ColumnSchema = {
  key: string;
  name: string;
  type: ColumnType;
  nullRatio: number;
  distinctCount: number;
};

export type RawRow = { rowNumber: number; cells: Cell[] };
export type RawSheet = { name: string; rows: RawRow[] };

export type InferredSheet = {
  name: string;
  /** 1-based worksheet row of the header, or 0 when the sheet has no header row. */
  headerRow: number;
  columns: ColumnSchema[];
  /** rowIndex is the original worksheet row number, so users can find the row in Excel. */
  rows: { rowIndex: number; data: Record<string, Cell> }[];
};

// Share of non-empty values that must fit a type. Below 100% so a few dirty cells do not
// demote a column to text; the data-quality rule reports those cells instead.
const TYPE_THRESHOLD = 0.9;
const HEADER_SCAN_ROWS = 20;

const ID_HEADER =
  /(^|[^a-z])(id|no|nömrə|nomre|number|num|code|kod|iban|card|kart|fin|pin|ref|reference|account|hesab)([^a-z]|$)/i;
const CURRENCY_HEADER =
  /amount|məbləğ|mebleg|balance|qalıq|qaliq|price|qiymət|cost|sum|total|cəm|azn|usd|eur|debit|credit|mədaxil|məxaric|payment|ödəniş|salary|maaş|fee|komissiya/i;
const PERCENT_HEADER = /%|percent|pct|faiz|rate|dərəcə/i;

const isLabel = (c: Cell) => typeof c === 'string' && toNumber(c) === null && toDate(c) === null;
const nonEmpty = (cells: Cell[]) => cells.filter((c) => c !== null);

/**
 * Picks the header row among the first rows: the first row that is wide enough and mostly text labels.
 * This skips report titles ("Q1 transactions"), blank lines and notes above the real table.
 */
function findHeaderIndex(rows: RawRow[]): number {
  const scan = rows.slice(0, HEADER_SCAN_ROWS);
  const width = Math.max(0, ...scan.map((r) => nonEmpty(r.cells).length));
  for (let i = 0; i < scan.length - 1; i++) {
    const filled = nonEmpty(scan[i]!.cells);
    if (
      filled.length >= Math.max(1, Math.ceil(width * 0.5)) &&
      filled.filter(isLabel).length / filled.length >= 0.8
    ) {
      return i;
    }
  }
  return -1;
}

const columnLetter = (i: number): string =>
  (i >= 26 ? columnLetter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

function slug(name: string, index: number) {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ə/gi, 'e')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || `col_${index + 1}`;
}

/** Appends _2, _3... so duplicate headers (common in exports) stay addressable. */
function uniquify(values: string[], sep: string) {
  const seen = new Map<string, number>();
  return values.map((v) => {
    const n = (seen.get(v) ?? 0) + 1;
    seen.set(v, n);
    return n === 1 ? v : `${v}${sep}${n}`;
  });
}

const share = (values: Cell[], test: (c: Cell) => boolean) => values.filter(test).length / values.length;

export function inferType(name: string, values: Cell[]): ColumnType {
  if (values.length === 0) return 'text';
  if (share(values, (v) => toBoolean(v) !== null) >= TYPE_THRESHOLD) return 'boolean';
  if (share(values, (v) => toDate(v) !== null) >= TYPE_THRESHOLD) return 'date';

  const distinctRatio = new Set(values.map(String)).size / values.length;
  if (share(values, (v) => toNumber(v) !== null) >= TYPE_THRESHOLD) {
    if (PERCENT_HEADER.test(name) || share(values, (v) => typeof v === 'string' && v.endsWith('%')) >= 0.5) {
      return 'percent';
    }
    if (
      CURRENCY_HEADER.test(name) ||
      share(values, (v) => typeof v === 'string' && /[₼$€£]|AZN|USD|EUR/i.test(v)) >= 0.5
    ) {
      return 'currency';
    }
    // Long digit strings (cards, phones, account numbers) are identifiers even with repeats; no
    // one sums phone numbers, and treating them as numbers would hide them from PII masking.
    if (
      values.every(
        (v) => typeof v === 'string' && /^\+?[\d\s-]{9,}$/.test(v) && (v.match(/\d/g)?.length ?? 0) >= 9,
      )
    ) {
      return 'id';
    }
    // Integer codes with an id-like header are identifiers; summing them would be meaningless.
    if (ID_HEADER.test(name) && distinctRatio >= 0.9 && values.every((v) => Number.isInteger(toNumber(v))))
      return 'id';
    return 'number';
  }
  if (ID_HEADER.test(name) && distinctRatio >= 0.9) return 'id';
  return 'text';
}

export function inferSheet(raw: RawSheet): InferredSheet {
  const rows = raw.rows.filter((r) => nonEmpty(r.cells).length > 0);
  const headerIndex = findHeaderIndex(rows);
  const header = headerIndex >= 0 ? rows[headerIndex]! : undefined;
  const body = rows.slice(headerIndex + 1);
  const width = Math.max(0, ...rows.map((r) => r.cells.length));

  // Columns with neither a header nor any data (stray formatting, merged-cell remnants) are dropped.
  const indexes = [...Array(width).keys()].filter(
    (i) => header?.cells[i] != null || body.some((r) => r.cells[i] != null),
  );
  const names = uniquify(
    indexes.map((i) => (header?.cells[i] != null ? String(header.cells[i]) : `Column ${columnLetter(i)}`)),
    ' ',
  );
  const keys = uniquify(
    indexes.map((i, n) => slug(names[n]!, i)),
    '_',
  );

  // Exports often repeat the header on every printed page; those rows are not data.
  const headerSignature = header ? JSON.stringify(header.cells) : null;
  const dataRows = body.filter((r) => JSON.stringify(r.cells) !== headerSignature);

  const columns = indexes.map((colIndex, n): ColumnSchema => {
    const all = dataRows.map((r) => r.cells[colIndex] ?? null);
    const values = nonEmpty(all);
    return {
      key: keys[n]!,
      name: names[n]!,
      type: inferType(names[n]!, values),
      nullRatio: all.length ? round((all.length - values.length) / all.length) : 0,
      distinctCount: new Set(values.map(String)).size,
    };
  });

  return {
    name: raw.name,
    headerRow: header?.rowNumber ?? 0,
    columns,
    rows: dataRows.map((r) => ({
      rowIndex: r.rowNumber,
      data: Object.fromEntries(indexes.map((colIndex, n) => [keys[n]!, r.cells[colIndex] ?? null])),
    })),
  };
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
