/** A normalized cell value as stored in DataRow.data. Dates are ISO strings. */
export type Cell = string | number | boolean | null;

/** Flattens exceljs cell values (formulas, rich text, hyperlinks, dates) to plain JSON values. */
export function normalizeCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  // trim() also strips a UTF-8 BOM that some CSV exports put before the first header.
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    // Formulas: keep the cached result, never the formula text (which can carry injection payloads).
    if ('result' in v) return normalizeCell(v.result);
    if (Array.isArray(v.richText))
      return normalizeCell(v.richText.map((r: { text?: string }) => r.text ?? '').join(''));
    if ('text' in v) return normalizeCell(v.text);
  }
  return null;
}

const CURRENCY_MARKS = /[₼$€£]|\b(AZN|USD|EUR|GBP|RUB|TRY|manat)\b/gi;

/**
 * Parses numbers as bank exports write them: currency marks, thousands separators,
 * decimal commas, accounting negatives "(1,200.00)" and trailing percent signs.
 */
export function toNumber(value: Cell): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  let s = value
    .replace(CURRENCY_MARKS, '')
    .replace(/[\s\u00a0']/g, '')
    .replace(/%$/, '');
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^[-+]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = sign * Number(s);
  return Number.isFinite(n) ? n : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const DMY_DATE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Parses dates as UTC wall-clock time. Excel stores no time zone, so the time a user sees
 * in the sheet is kept exactly; off-hours detection then works on that wall-clock time.
 */
export function toDate(value: Cell): Date | null {
  if (typeof value !== 'string') return null;
  if (ISO_DATE.test(value)) {
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value) && value.length > 10;
    const d = new Date(
      hasZone ? value : `${value.replace(' ', 'T')}${value.length > 10 ? 'Z' : 'T00:00:00Z'}`,
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = DMY_DATE.exec(value);
  if (!m) return null;
  const [, day, month, year, hh = '0', mm = '0', ss = '0'] = m;
  const d = new Date(Date.UTC(+year!, +month! - 1, +day!, +hh, +mm, +ss));
  // Reject roll-over dates such as 31.02.2024.
  return d.getUTCDate() === +day! && d.getUTCMonth() === +month! - 1 ? d : null;
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', 'bəli', 'beli', 'hə', 'he']);
const FALSE_WORDS = new Set(['false', 'no', 'n', 'xeyr', 'yox']);

export function toBoolean(value: Cell): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const s = value.toLowerCase();
  return TRUE_WORDS.has(s) ? true : FALSE_WORDS.has(s) ? false : null;
}
