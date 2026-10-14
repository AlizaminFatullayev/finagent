import type { ColumnSchema } from '../ingest/schema.js';
import { toDate, toNumber } from '../ingest/values.js';
import type { AnalysisSheet } from './types.js';

export const MAX_ROW_REFS = 50;

/** Rounds for display and storage; 4 decimals keeps percentages and ratios meaningful. */
export const round = (n: number, digits = 4) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);

/** Sample standard deviation (n-1), the usual choice for a sample of transactions. */
export function stddev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

/** Linear-interpolation quantile (same as Excel's PERCENTILE.INC), on a sorted array. */
export function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export const numericValues = (sheet: AnalysisSheet, key: string) =>
  sheet.rows.flatMap((r) => {
    const value = toNumber(r.data[key] ?? null);
    return value === null ? [] : [{ rowIndex: r.rowIndex, value }];
  });

export const dateValues = (sheet: AnalysisSheet, key: string) =>
  sheet.rows.flatMap((r) => {
    const value = toDate(r.data[key] ?? null);
    return value === null ? [] : [{ rowIndex: r.rowIndex, value }];
  });

/**
 * Columns that hold money-like amounts. Currency columns are preferred; plain numbers are used
 * only when no currency column exists. IDs and percentages are never amounts.
 */
export function amountColumns(sheet: AnalysisSheet): ColumnSchema[] {
  const currency = sheet.columns.filter((c) => c.type === 'currency');
  return currency.length ? currency : sheet.columns.filter((c) => c.type === 'number');
}

export const refs = (rowIndexes: number[]) => rowIndexes.slice(0, MAX_ROW_REFS);

export const fmt = (n: number) => round(n, 2).toLocaleString('en-US');
