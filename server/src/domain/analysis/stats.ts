import { toBoolean } from '../ingest/values.js';
import { dateValues, mean, numericValues, quantile, round, stddev, sum } from './numeric.js';
import { NUMERIC_TYPES, type AnalysisSheet } from './types.js';

const DAY_MS = 86_400_000;
const TOP_VALUES = 5;

export type ColumnStats = {
  key: string;
  name: string;
  type: string;
  count: number;
  nullRate: number;
  numeric?: {
    sum: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    stddev: number;
    p5: number;
    p25: number;
    p75: number;
    p95: number;
  };
  topValues?: { value: string; count: number }[];
  distinctCount?: number;
  dateRange?: {
    min: string;
    max: string;
    spanDays: number;
    largestGapDays: number;
    largestGapAfter: string | null;
  };
  booleans?: { true: number; false: number };
};

export type SheetStats = {
  sheet: string;
  rowCount: number;
  columnCount: number;
  nullRate: number;
  columns: ColumnStats[];
};

export function computeSheetStats(sheet: AnalysisSheet): SheetStats {
  const total = sheet.rows.length;
  let nullCells = 0;

  const columns = sheet.columns.map((col): ColumnStats => {
    const nonNull = sheet.rows.filter((r) => r.data[col.key] != null);
    nullCells += total - nonNull.length;
    const base: ColumnStats = {
      key: col.key,
      name: col.name,
      type: col.type,
      count: nonNull.length,
      nullRate: total ? round((total - nonNull.length) / total) : 0,
    };

    if (NUMERIC_TYPES.includes(col.type)) {
      const xs = numericValues(sheet, col.key).map((v) => v.value);
      const sorted = [...xs].sort((a, b) => a - b);
      if (xs.length) {
        base.numeric = {
          sum: round(sum(xs), 2),
          mean: round(mean(xs)),
          median: round(quantile(sorted, 0.5)),
          min: sorted[0]!,
          max: sorted.at(-1)!,
          stddev: round(stddev(xs)),
          p5: round(quantile(sorted, 0.05)),
          p25: round(quantile(sorted, 0.25)),
          p75: round(quantile(sorted, 0.75)),
          p95: round(quantile(sorted, 0.95)),
        };
      }
    } else if (col.type === 'date') {
      const days = [
        ...new Set(dateValues(sheet, col.key).map((d) => Math.floor(d.value.getTime() / DAY_MS))),
      ].sort((a, b) => a - b);
      if (days.length) {
        // The longest stretch without any activity often reveals missing data or an outage.
        let gap = 0;
        let gapAfter: number | null = null;
        for (let i = 1; i < days.length; i++) {
          if (days[i]! - days[i - 1]! > gap) {
            gap = days[i]! - days[i - 1]!;
            gapAfter = days[i - 1]!;
          }
        }
        const iso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
        base.dateRange = {
          min: iso(days[0]!),
          max: iso(days.at(-1)!),
          spanDays: days.at(-1)! - days[0]!,
          largestGapDays: gap,
          largestGapAfter: gapAfter === null ? null : iso(gapAfter),
        };
      }
    } else if (col.type === 'boolean') {
      const bools = nonNull.map((r) => toBoolean(r.data[col.key] ?? null));
      base.booleans = {
        true: bools.filter((b) => b === true).length,
        false: bools.filter((b) => b === false).length,
      };
    } else {
      const counts = new Map<string, number>();
      for (const r of nonNull)
        counts.set(String(r.data[col.key]), (counts.get(String(r.data[col.key])) ?? 0) + 1);
      base.distinctCount = counts.size;
      base.topValues = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TOP_VALUES)
        .map(([value, count]) => ({ value, count }));
    }
    return base;
  });

  const cells = total * sheet.columns.length;
  return {
    sheet: sheet.name,
    rowCount: total,
    columnCount: sheet.columns.length,
    nullRate: cells ? round(nullCells / cells) : 0,
    columns,
  };
}
