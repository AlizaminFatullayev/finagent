import { z } from 'zod';
import type { ColumnSchema, ColumnType } from '../ingest/schema.js';
import { toDate, toNumber, type Cell } from '../ingest/values.js';
import { amountColumns, round } from './numeric.js';
import type { SheetStats } from './stats.js';
import { NUMERIC_TYPES, type Anomaly } from './types.js';

/** Bump whenever chart output changes; it is part of the chart cache key, so bumping invalidates. */
export const CHARTS_VERSION = '1';
export const MAX_POINTS = 200;
const MAX_BINS = 50;
const MAX_HISTOGRAMS = 3;
const TOP_CATEGORIES = 10;
const MAX_CATEGORY_COLUMNS = 2;
// Above this many distinct values a "top 10" says little about the column.
const MAX_CATEGORY_CARDINALITY = 50;
const DATA_QUALITY_COLUMNS = 10;
const DAY_MS = 86_400_000;

const Point = z.object({ x: z.union([z.string(), z.number()]), y: z.number() });

export const ChartSpecSchema = z
  .object({
    id: z.string().meta({ description: 'Stable id: `<chart>:<sheet position>[:<column key>]`' }),
    type: z.enum(['bar', 'line', 'histogram', 'pie']),
    title: z.string().meta({ description: 'In the analysis language (az | en)' }),
    sheetId: z.uuid(),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    unit: z.string().optional().meta({ description: 'Currency code when detected, or `%`' }),
    series: z.array(z.object({ name: z.string(), points: z.array(Point) })),
    meta: z
      .object({
        truncated: z
          .boolean()
          .optional()
          .meta({ description: `Series were cut to ${MAX_POINTS} points` }),
        bucket: z.enum(['day', 'week', 'month', 'hour']).optional(),
        note: z.string().optional(),
      })
      .optional(),
  })
  .meta({ id: 'ChartSpec' });
export type ChartSpec = z.infer<typeof ChartSpecSchema>;

type Language = 'az' | 'en';
type Row = { rowIndex: number; data: Record<string, Cell> };
export type ChartSheet = { id: string; name: string; position: number; columns: ColumnSchema[] };

const TEXT = {
  en: {
    byType: 'Anomalies by type',
    bySeverity: 'Anomalies by severity',
    overTime: (c: string) => `"${c}" over time`,
    rowsOverTime: 'Rows over time',
    distribution: (c: string) => `Distribution of "${c}"`,
    topValues: (c: string) => `Top values of "${c}"`,
    hourly: (c: string) => `Activity by hour of day ("${c}")`,
    dataQuality: 'Missing values by column',
    type: 'Type',
    severity: 'Severity',
    count: 'Count',
    sum: 'Sum',
    date: 'Date',
    hour: 'Hour',
    value: 'Value',
    column: 'Column',
    nullRate: 'Missing values',
    binNote: (w: number) => `x is the lower bound of each bin; bin width ${w}`,
    clippedNote: (w: number) =>
      `x is the lower bound of each bin; bin width ${w}; values below the 5th or above the 95th percentile are counted in the edge bins`,
  },
  az: {
    byType: 'Növə görə anomaliyalar',
    bySeverity: 'Ciddiliyə görə anomaliyalar',
    overTime: (c: string) => `"${c}" zamana görə`,
    rowsOverTime: 'Zamana görə sətirlər',
    distribution: (c: string) => `"${c}" paylanması`,
    topValues: (c: string) => `"${c}" üzrə ən çox rast gələn dəyərlər`,
    hourly: (c: string) => `Günün saatlarına görə aktivlik ("${c}")`,
    dataQuality: 'Sütunlar üzrə boş dəyərlər',
    type: 'Növ',
    severity: 'Ciddilik',
    count: 'Say',
    sum: 'Cəm',
    date: 'Tarix',
    hour: 'Saat',
    value: 'Dəyər',
    column: 'Sütun',
    nullRate: 'Boş dəyərlər',
    binNote: (w: number) => `x hər intervalın aşağı sərhədidir; interval eni ${w}`,
    clippedNote: (w: number) =>
      `x hər intervalın aşağı sərhədidir; interval eni ${w}; 5-ci persentildən aşağı və 95-ci persentildən yuxarı dəyərlər kənar intervallarda sayılır`,
  },
} as const;

const CURRENCY = /\b(AZN|USD|EUR|GBP|RUB|TRY)\b|₼|\$|€|£/i;
const SYMBOLS: Record<string, string> = { '₼': 'AZN', $: 'USD', '€': 'EUR', '£': 'GBP' };
function currencyOf(column: ColumnSchema) {
  if (column.type !== 'currency') return undefined;
  const m = CURRENCY.exec(column.name);
  return m ? (SYMBOLS[m[0]] ?? m[0].toUpperCase()) : undefined;
}

const hasTime = (d: Date) => d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() > 0;
const byNullRatio = (a: ColumnSchema, b: ColumnSchema) => a.nullRatio - b.nullRatio;

type Bucket = 'day' | 'week' | 'month';
// Day resolution up to a quarter, weeks up to two years, months beyond.
const pickBucket = (spanDays: number): Bucket =>
  spanDays <= 92 ? 'day' : spanDays <= 730 ? 'week' : 'month';
function bucketStart(day: number, bucket: Bucket) {
  const d = new Date(day * DAY_MS);
  if (bucket === 'day') return day * DAY_MS;
  // ISO weeks start on Monday.
  if (bucket === 'week') return (day - ((d.getUTCDay() + 6) % 7)) * DAY_MS;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function nextBucket(t: number, bucket: Bucket) {
  if (bucket === 'month') {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return t + (bucket === 'day' ? 1 : 7) * DAY_MS;
}
const bucketLabel = (t: number, bucket: Bucket) =>
  new Date(t).toISOString().slice(0, bucket === 'month' ? 7 : 10);

type Histogram = {
  column: ColumnSchema;
  lo: number;
  width: number;
  counts: number[];
  clipped: boolean;
};

/**
 * Freedman-Diaconis bins (Sturges when the IQR is 0), capped at MAX_BINS. When heavy outliers
 * would squeeze all ordinary values into one bin, the range is clipped to p5..p95 instead.
 */
function histogramFor(
  column: ColumnSchema,
  s: NonNullable<SheetStats['columns'][number]['numeric']>,
  n: number,
) {
  const binsFor = (lo: number, hi: number) => {
    const iqr = s.p75 - s.p25;
    const raw = iqr > 0 ? (hi - lo) / ((2 * iqr) / Math.cbrt(n)) : Math.log2(n) + 1;
    return Math.max(1, Math.ceil(raw));
  };
  let lo = s.min;
  let hi = s.max;
  let bins = binsFor(lo, hi);
  const clipped = bins > MAX_BINS && s.p95 > s.p5;
  if (clipped) {
    lo = s.p5;
    hi = s.p95;
    bins = binsFor(lo, hi);
  }
  bins = Math.min(bins, MAX_BINS);
  return { column, lo, width: (hi - lo) / bins, counts: new Array<number>(bins).fill(0), clipped };
}

/**
 * Accumulates chart data for one sheet from batches of already-masked rows, so memory depends
 * on the number of distinct days and categories, not on the number of rows.
 */
export class SheetChartBuilder {
  private readonly dateColumns: ColumnSchema[];
  private readonly amount: ColumnSchema | undefined;
  private readonly histograms: Histogram[];
  private readonly categories: { column: ColumnSchema; counts: Map<string, number> }[];
  private readonly days = new Map<number, { sum: number; count: number }>();
  private readonly hours = new Map<string, { counts: number[]; timed: boolean }>();

  constructor(
    private readonly sheet: ChartSheet,
    stats: SheetStats | undefined,
  ) {
    this.dateColumns = sheet.columns.filter((c) => c.type === 'date').sort(byNullRatio);
    for (const c of this.dateColumns)
      this.hours.set(c.key, { counts: new Array<number>(24).fill(0), timed: false });
    this.amount = amountColumns({ name: sheet.name, columns: sheet.columns, rows: [] }).sort(byNullRatio)[0];

    // Prefer complete columns, then the most spread-out ones.
    this.histograms = (stats?.columns ?? [])
      .filter(
        (c) =>
          NUMERIC_TYPES.includes(c.type as ColumnType) &&
          c.numeric &&
          c.count > 1 &&
          c.numeric.max > c.numeric.min,
      )
      .sort((a, b) => a.nullRate - b.nullRate || b.numeric!.stddev - a.numeric!.stddev)
      .slice(0, MAX_HISTOGRAMS)
      .flatMap((c) => {
        const column = sheet.columns.find((col) => col.key === c.key);
        return column ? [histogramFor(column, c.numeric!, c.count)] : [];
      });

    this.categories = sheet.columns
      .filter((c) => c.type === 'text' && c.distinctCount >= 2 && c.distinctCount <= MAX_CATEGORY_CARDINALITY)
      .sort(byNullRatio)
      .slice(0, MAX_CATEGORY_COLUMNS)
      .map((column) => ({ column, counts: new Map() }));
  }

  add(rows: Row[]) {
    const primaryDate = this.dateColumns[0];
    for (const { data } of rows) {
      if (primaryDate) {
        const d = toDate(data[primaryDate.key] ?? null);
        if (d) {
          const day = Math.floor(d.getTime() / DAY_MS);
          const acc = this.days.get(day) ?? { sum: 0, count: 0 };
          acc.count += 1;
          acc.sum += this.amount ? (toNumber(data[this.amount.key] ?? null) ?? 0) : 0;
          this.days.set(day, acc);
        }
      }
      for (const c of this.dateColumns) {
        const d = toDate(data[c.key] ?? null);
        if (!d) continue;
        const h = this.hours.get(c.key)!;
        h.counts[d.getUTCHours()]! += 1;
        h.timed ||= hasTime(d);
      }
      for (const h of this.histograms) {
        const v = toNumber(data[h.column.key] ?? null);
        if (v === null) continue;
        // Values outside the (possibly clipped) range land in the edge bins.
        const i = h.width > 0 ? Math.floor((v - h.lo) / h.width) : 0;
        h.counts[Math.min(h.counts.length - 1, Math.max(0, i))]! += 1;
      }
      for (const { column, counts } of this.categories) {
        const v = data[column.key];
        if (v == null) continue;
        counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
      }
    }
  }

  finish(anomalies: Anomaly[], language: Language): ChartSpec[] {
    const t = TEXT[language];
    const { id: sheetId, position } = this.sheet;
    const charts: ChartSpec[] = [];

    const own = anomalies.filter((a) => a.sheet === this.sheet.name);
    if (own.length) {
      const byType = new Map<string, number>();
      for (const a of own) byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
      charts.push({
        id: `anomalies-by-type:${position}`,
        type: 'bar',
        title: t.byType,
        sheetId,
        xLabel: t.type,
        yLabel: t.count,
        series: [
          {
            name: t.count,
            points: [...byType]
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .map(([x, y]) => ({ x, y })),
          },
        ],
      });
      charts.push({
        id: `anomalies-by-severity:${position}`,
        type: 'pie',
        title: t.bySeverity,
        sheetId,
        series: [
          {
            name: t.count,
            points: (['HIGH', 'MEDIUM', 'LOW'] as const)
              .map((x) => ({ x, y: own.filter((a) => a.severity === x).length }))
              .filter((p) => p.y > 0),
          },
        ],
      });
    }

    const primaryDate = this.dateColumns[0];
    if (primaryDate && this.days.size) {
      const dayKeys = [...this.days.keys()].sort((a, b) => a - b);
      const bucket = pickBucket(dayKeys.at(-1)! - dayKeys[0]!);
      const buckets = new Map<number, { sum: number; count: number }>();
      for (const [day, v] of this.days) {
        const k = bucketStart(day, bucket);
        const acc = buckets.get(k) ?? { sum: 0, count: 0 };
        acc.sum += v.sum;
        acc.count += v.count;
        buckets.set(k, acc);
      }
      // Empty periods are zero-filled so gaps in activity stay visible on a line chart.
      const keys: number[] = [];
      const last = bucketStart(dayKeys.at(-1)!, bucket);
      for (let k = bucketStart(dayKeys[0]!, bucket); k <= last; k = nextBucket(k, bucket)) keys.push(k);
      const series = [
        ...(this.amount
          ? [
              {
                name: t.sum,
                points: keys.map((k) => ({
                  x: bucketLabel(k, bucket),
                  y: round(buckets.get(k)?.sum ?? 0, 2),
                })),
              },
            ]
          : []),
        {
          name: t.count,
          points: keys.map((k) => ({ x: bucketLabel(k, bucket), y: buckets.get(k)?.count ?? 0 })),
        },
      ];
      charts.push({
        id: `time-series:${position}:${primaryDate.key}`,
        type: 'line',
        title: this.amount ? t.overTime(this.amount.name) : t.rowsOverTime,
        sheetId,
        xLabel: t.date,
        yLabel: this.amount ? this.amount.name : t.count,
        ...(this.amount && currencyOf(this.amount) ? { unit: currencyOf(this.amount) } : {}),
        series,
        meta: { bucket },
      });
    }

    for (const h of this.histograms) {
      const width = round(h.width, 4);
      charts.push({
        id: `histogram:${position}:${h.column.key}`,
        type: 'histogram',
        title: t.distribution(h.column.name),
        sheetId,
        xLabel: h.column.name,
        yLabel: t.count,
        ...(currencyOf(h.column) ? { unit: currencyOf(h.column) } : {}),
        series: [{ name: t.count, points: h.counts.map((y, i) => ({ x: round(h.lo + i * h.width, 2), y })) }],
        meta: { note: h.clipped ? t.clippedNote(width) : t.binNote(width) },
      });
    }

    for (const { column, counts } of this.categories) {
      if (!counts.size) continue;
      charts.push({
        id: `top-values:${position}:${column.key}`,
        type: 'bar',
        title: t.topValues(column.name),
        sheetId,
        xLabel: t.value,
        yLabel: t.count,
        series: [
          {
            name: t.count,
            points: [...counts]
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .slice(0, TOP_CATEGORIES)
              .map(([x, y]) => ({ x, y })),
          },
        ],
      });
    }

    // Date-only columns put every entry at midnight, which says nothing about the hour.
    const timed = this.dateColumns.find((c) => this.hours.get(c.key)!.timed);
    if (timed) {
      charts.push({
        id: `hourly:${position}:${timed.key}`,
        type: 'bar',
        title: t.hourly(timed.name),
        sheetId,
        xLabel: t.hour,
        yLabel: t.count,
        series: [{ name: t.count, points: this.hours.get(timed.key)!.counts.map((y, x) => ({ x, y })) }],
        meta: { bucket: 'hour' },
      });
    }

    if (this.sheet.columns.length) {
      charts.push({
        id: `data-quality:${position}`,
        type: 'bar',
        title: t.dataQuality,
        sheetId,
        xLabel: t.column,
        yLabel: t.nullRate,
        unit: '%',
        series: [
          {
            name: t.nullRate,
            points: [...this.sheet.columns]
              .sort((a, b) => b.nullRatio - a.nullRatio || a.name.localeCompare(b.name))
              .slice(0, DATA_QUALITY_COLUMNS)
              .map((c) => ({ x: c.name, y: round(c.nullRatio * 100, 2) })),
          },
        ],
      });
    }

    return charts.map(capPoints);
  }
}

/** Keeps every series within MAX_POINTS so any client can render it without its own downsampling. */
function capPoints(chart: ChartSpec): ChartSpec {
  if (chart.series.every((s) => s.points.length <= MAX_POINTS)) return chart;
  return {
    ...chart,
    series: chart.series.map((s) => ({ ...s, points: s.points.slice(-MAX_POINTS) })),
    meta: { ...chart.meta, truncated: true },
  };
}
