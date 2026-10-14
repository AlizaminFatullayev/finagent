import { describe, expect, it } from 'vitest';
import type { ColumnSchema } from '../ingest/schema.js';
import type { Cell } from '../ingest/values.js';
import { MAX_POINTS, SheetChartBuilder, type ChartSheet } from './charts.js';
import { analyzeWorkbook } from './engine.js';

const col = (key: string, type: ColumnSchema['type'], extra: Partial<ColumnSchema> = {}): ColumnSchema => ({
  key,
  name: key,
  type,
  nullRatio: 0,
  distinctCount: 10,
  ...extra,
});

function charts(columns: ColumnSchema[], data: Record<string, Cell>[], language: 'az' | 'en' = 'en') {
  const sheet: ChartSheet = { id: '00000000-0000-4000-8000-000000000001', name: 'S', position: 0, columns };
  const rows = data.map((d, i) => ({ rowIndex: i + 2, data: d }));
  const engine = analyzeWorkbook([{ name: 'S', columns, rows }], { thresholdAmount: 10_000 });
  const builder = new SheetChartBuilder(sheet, engine.stats[0]);
  // Two batches, as the service streams them.
  builder.add(rows.slice(0, 7));
  builder.add(rows.slice(7));
  return builder.finish(engine.anomalies, language);
}

const day = (i: number, hour = 10) => new Date(Date.UTC(2026, 0, 1 + i, hour)).toISOString();

describe('SheetChartBuilder', () => {
  it('builds time series, histogram, top values, hourly and data quality charts', () => {
    const data = Array.from({ length: 40 }, (_, i) => ({
      date: day(i % 20, 9 + (i % 5)),
      amount: 100 + i * 10,
      channel: i % 3 === 0 ? 'ATM' : 'Online',
      note: i % 4 === 0 ? null : 'x',
    }));
    const result = charts(
      [
        col('date', 'date'),
        col('amount', 'currency', { name: 'Amount (AZN)' }),
        col('channel', 'text', { distinctCount: 2 }),
        col('note', 'text', { nullRatio: 0.25, distinctCount: 1 }),
      ],
      data,
    );
    const byId = Object.fromEntries(result.map((c) => [c.id, c]));

    const ts = byId['time-series:0:date']!;
    expect(ts).toMatchObject({ type: 'line', unit: 'AZN', meta: { bucket: 'day' } });
    expect(ts.series.map((s) => s.name)).toEqual(['Sum', 'Count']);
    expect(ts.series[1]!.points).toHaveLength(20);
    expect(ts.series[1]!.points.reduce((a, p) => a + p.y, 0)).toBe(40);
    expect(ts.series[0]!.points[0]).toEqual({ x: '2026-01-01', y: 100 + 300 });

    const hist = byId['histogram:0:amount']!;
    expect(hist.type).toBe('histogram');
    expect(hist.series[0]!.points.reduce((a, p) => a + p.y, 0)).toBe(40);

    expect(byId['top-values:0:channel']!.series[0]!.points).toEqual([
      { x: 'Online', y: 26 },
      { x: 'ATM', y: 14 },
    ]);
    // One distinct value is not a distribution worth charting.
    expect(byId['top-values:0:note']).toBeUndefined();

    const hourly = byId['hourly:0:date']!.series[0]!.points;
    expect(hourly).toHaveLength(24);
    expect(hourly[9]).toEqual({ x: 9, y: 8 });

    expect(byId['data-quality:0']!.series[0]!.points[0]).toEqual({ x: 'note', y: 25 });
  });

  it('skips charts whose column types are missing', () => {
    const result = charts(
      [col('name', 'text', { distinctCount: 2 })],
      Array.from({ length: 10 }, (_, i) => ({ name: i % 2 ? 'a' : 'b' })),
    );
    expect(result.map((c) => c.id).filter((id) => !id.startsWith('anomalies'))).toEqual([
      'top-values:0:name',
      'data-quality:0',
    ]);
  });

  it('switches to monthly buckets for long ranges and caps series at 200 points', () => {
    // 20 years of monthly data: 240 month buckets.
    const data = Array.from({ length: 241 }, (_, i) => ({
      date: new Date(Date.UTC(2006, i, 1)).toISOString().slice(0, 10),
    }));
    const ts = charts([col('date', 'date')], data).find((c) => c.type === 'line')!;
    expect(ts.meta).toMatchObject({ bucket: 'month', truncated: true });
    expect(ts.series[0]!.points).toHaveLength(MAX_POINTS);
    // The most recent periods are kept.
    expect(ts.series[0]!.points.at(-1)!.x).toBe('2026-01');
    // Date-only values carry no time of day, so no hourly chart.
    expect(ts.title).toBe('Rows over time');
  });

  it('clips heavy outliers so ordinary values are not squeezed into one bin', () => {
    const data: Record<string, Cell>[] = Array.from({ length: 200 }, (_, i) => ({ amount: 10 + (i % 100) }));
    data.push({ amount: 1_250_000 });
    const hist = charts([col('amount', 'currency')], data).find((c) => c.type === 'histogram')!;
    const counts = hist.series[0]!.points.map((p) => p.y);
    expect(counts.length).toBeLessThanOrEqual(50);
    expect(Math.max(...counts)).toBeLessThan(100);
    expect(hist.meta?.note).toContain('95th percentile');
  });

  it('writes titles in the analysis language', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ amount: i * 3 + 1 }));
    const az = charts([col('amount', 'number', { name: 'Məbləğ' })], data, 'az');
    expect(az.map((c) => c.title)).toEqual(['"Məbləğ" paylanması', 'Sütunlar üzrə boş dəyərlər']);
    expect(az[0]!.yLabel).toBe('Say');
  });
});
