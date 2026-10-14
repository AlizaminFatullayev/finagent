import type { ColumnSchema, ColumnType } from '../ingest/schema.js';
import type { Cell } from '../ingest/values.js';
import type { AnalysisSheet } from './types.js';

/** Deterministic PRNG (mulberry32) so planted-anomaly tests never flake. */
export function rng(seed = 42) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds an AnalysisSheet from column specs and row objects keyed by column key. */
export function sheetOf(
  columns: [key: string, type: ColumnType][],
  rows: Record<string, Cell>[],
): AnalysisSheet {
  return {
    name: 'Test',
    columns: columns.map(([key, type]): ColumnSchema => ({
      key,
      name: key,
      type,
      nullRatio: 0,
      distinctCount: 0,
    })),
    rows: rows.map((data, i) => ({ rowIndex: i + 2, data })),
  };
}

/** Log-uniform amounts follow Benford's law, like real transaction amounts. */
export function naturalAmounts(n: number, random = rng()) {
  return Array.from({ length: n }, () => Math.round(10 ** (1 + random() * 4) * 100) / 100);
}
