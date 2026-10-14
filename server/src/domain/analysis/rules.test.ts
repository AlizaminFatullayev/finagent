import { describe, expect, it } from 'vitest';
import { analyzeWorkbook, RULES } from './engine.js';
import { benfordRule } from './rules/benford.js';
import { dataQualityRule } from './rules/dataQuality.js';
import { duplicatesRule } from './rules/duplicates.js';
import { offHoursRule } from './rules/offHours.js';
import { outliersRule } from './rules/outliers.js';
import { roundAmountsRule } from './rules/roundAmounts.js';
import { structuringRule } from './rules/structuring.js';
import { computeSheetStats } from './stats.js';
import { naturalAmounts, rng, sheetOf } from './testData.js';

const ctx = { thresholdAmount: 10_000 };
const amountsSheet = (amounts: number[]) =>
  sheetOf(
    [['amount', 'currency']],
    amounts.map((amount) => ({ amount })),
  );

describe('stats', () => {
  it('computes numeric, text, date and boolean statistics', () => {
    const sheet = sheetOf(
      [
        ['amount', 'currency'],
        ['city', 'text'],
        ['day', 'date'],
        ['ok', 'boolean'],
      ],
      [
        { amount: 10, city: 'Baku', day: '2024-01-01', ok: true },
        { amount: 20, city: 'Baku', day: '2024-01-02', ok: false },
        { amount: 30, city: 'Ganja', day: '2024-01-10', ok: true },
        { amount: null, city: null, day: null, ok: null },
      ],
    );
    const stats = computeSheetStats(sheet);
    expect(stats.rowCount).toBe(4);
    expect(stats.columns[0]!.numeric).toMatchObject({
      sum: 60,
      mean: 20,
      median: 20,
      min: 10,
      max: 30,
      stddev: 10,
    });
    expect(stats.columns[0]!.nullRate).toBe(0.25);
    expect(stats.columns[1]!.topValues).toEqual([
      { value: 'Baku', count: 2 },
      { value: 'Ganja', count: 1 },
    ]);
    expect(stats.columns[2]!.dateRange).toMatchObject({
      min: '2024-01-01',
      max: '2024-01-10',
      spanDays: 9,
      largestGapDays: 8,
    });
    expect(stats.columns[3]!.booleans).toEqual({ true: 2, false: 1 });
  });
});

describe('statistical outliers', () => {
  it('flags a planted extreme value with its fences', () => {
    const amounts = naturalAmounts(200).map((a) => Math.min(a, 5_000));
    amounts[17] = 2_500_000;
    const [a] = outliersRule.run(amountsSheet(amounts), ctx);
    expect(a).toMatchObject({ type: 'outlier', severity: 'HIGH', metrics: { mostExtremeValue: 2_500_000 } });
    expect(a!.rowIndexes).toContain(19);
  });

  it('stays quiet on tight data and skips sheets without numeric columns', () => {
    expect(outliersRule.run(amountsSheet(Array.from({ length: 50 }, (_, i) => 100 + (i % 5))), ctx)).toEqual(
      [],
    );
    expect(outliersRule.run(sheetOf([['name', 'text']], [{ name: 'x' }]), ctx)).toEqual([]);
  });
});

describe('duplicates', () => {
  const cols: [string, 'id' | 'date' | 'currency' | 'text'][] = [
    ['txn', 'id'],
    ['at', 'date'],
    ['amount', 'currency'],
    ['payee', 'text'],
  ];

  it('finds exact and near duplicates', () => {
    const sheet = sheetOf(cols, [
      { txn: 1, at: '2024-01-01T10:00:00Z', amount: 500, payee: 'ACME' },
      { txn: 1, at: '2024-01-01T10:00:00Z', amount: 500, payee: 'ACME' },
      { txn: 2, at: '2024-01-02T09:00:00Z', amount: 700, payee: 'Beta LLC' },
      { txn: 3, at: '2024-01-02T09:05:00Z', amount: 700.2, payee: 'beta llc' },
    ]);
    const found = duplicatesRule.run(sheet, ctx);
    expect(found.map((a) => a.type)).toEqual(['exact_duplicate', 'near_duplicate']);
    expect(found[0]!.rowIndexes).toEqual([2, 3]);
    expect(found[1]!.rowIndexes).toEqual([4, 5]);
  });

  it('does not flag distinct rows', () => {
    const sheet = sheetOf(cols, [
      { txn: 1, at: '2024-01-01T10:00:00Z', amount: 500, payee: 'ACME' },
      { txn: 2, at: '2024-01-01T10:00:00Z', amount: 900, payee: 'ACME' },
    ]);
    expect(duplicatesRule.run(sheet, ctx)).toEqual([]);
  });
});

describe('round amounts', () => {
  it('flags clusters of exact thousands', () => {
    const amounts = [
      ...naturalAmounts(60).map((a) => a + 1_000.37),
      ...Array.from({ length: 30 }, (_, i) => (i + 1) * 1_000),
    ];
    const [a] = roundAmountsRule.run(amountsSheet(amounts), ctx);
    expect(a).toMatchObject({ type: 'round_amount_cluster', metrics: { roundCount: 30, eligibleCount: 90 } });
  });

  it('ignores organic amounts', () => {
    expect(roundAmountsRule.run(amountsSheet(naturalAmounts(200).map((a) => a + 0.37)), ctx)).toEqual([]);
  });
});

describe('structuring', () => {
  it('flags many amounts just under the threshold', () => {
    const amounts = [
      ...naturalAmounts(100).map((a) => Math.min(a, 8_000)),
      9_500,
      9_800,
      9_900,
      9_950,
      9_700,
      9_990,
      10_200,
    ];
    const [a] = structuringRule.run(amountsSheet(amounts), ctx);
    expect(a).toMatchObject({
      type: 'structuring',
      metrics: { countJustBelow: 6, countJustAbove: 1, threshold: 10_000 },
    });
  });

  it('does not flag a balanced distribution around the threshold', () => {
    expect(structuringRule.run(amountsSheet([9_500, 9_800, 9_900, 10_100, 10_300, 10_500]), ctx)).toEqual([]);
  });
});

describe('off-hours activity', () => {
  it('flags night-time bursts and weekend entries', () => {
    const rows = [
      // Weekday office hours: Tue 2024-01-02
      ...Array.from({ length: 20 }, (_, i) => ({
        at: `2024-01-02T${String(9 + (i % 8)).padStart(2, '0')}:15:00Z`,
      })),
      // Five entries between 02:00 and 02:40 on a Wednesday night.
      ...[0, 10, 20, 30, 40].map((m) => ({ at: `2024-01-03T02:${String(m).padStart(2, '0')}:00Z` })),
      // Saturday entries.
      ...[10, 11, 12].map((h) => ({ at: `2024-01-06T${h}:00:00Z` })),
    ];
    const types = offHoursRule.run(sheetOf([['at', 'date']], rows), ctx).map((a) => a.type);
    expect(types).toEqual(['weekend_activity', 'off_hours_activity', 'off_hours_burst']);
  });

  it('treats date-only columns as having no time and ignores weekdays', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      at: `2024-01-${String(1 + (i % 5)).padStart(2, '0')}`,
    }));
    expect(offHoursRule.run(sheetOf([['at', 'date']], rows), ctx)).toEqual([]);
  });
});

describe('Benford first digit', () => {
  it('flags uniformly distributed (fabricated-looking) amounts', () => {
    const random = rng(7);
    const fabricated = Array.from({ length: 500 }, () => Math.round(1_000 + random() * 8_999));
    const [a] = benfordRule.run(amountsSheet(fabricated), ctx);
    expect(a!.type).toBe('benford_deviation');
    expect(Number(a!.metrics.mad)).toBeGreaterThan(0.015);
  });

  it('accepts Benford-conforming data and skips small samples', () => {
    expect(benfordRule.run(amountsSheet(naturalAmounts(2_000)), ctx)).toEqual([]);
    expect(benfordRule.run(amountsSheet([1_000, 2_000, 3_000]), ctx)).toEqual([]);
  });
});

describe('data quality', () => {
  it('reports null spikes, mixed types and rare negatives', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      amount: i === 3 ? -50 : i === 5 ? 'n/a' : 100 + i,
      note: i % 2 ? null : 'x',
    }));
    const types = dataQualityRule
      .run(
        sheetOf(
          [
            ['amount', 'currency'],
            ['note', 'text'],
          ],
          rows,
        ),
        ctx,
      )
      .map((a) => a.type);
    expect(types).toEqual(['mixed_types', 'null_spike', 'unusual_negative']);
  });

  it('is quiet on clean data', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ amount: 100 + i }));
    expect(dataQualityRule.run(sheetOf([['amount', 'currency']], rows), ctx)).toEqual([]);
  });
});

describe('engine', () => {
  it('runs every rule, orders by severity and assigns stable ids', () => {
    const amounts = naturalAmounts(300);
    amounts[0] = 9_000_000;
    const result = analyzeWorkbook([amountsSheet(amounts)], ctx);
    expect(result.methodology).toHaveLength(RULES.length);
    expect(result.anomalies[0]).toMatchObject({ id: 'A1', severity: 'HIGH', type: 'outlier' });
    expect(result.severityCounts.HIGH).toBeGreaterThanOrEqual(1);
  });

  it('skips gracefully when no column types match', () => {
    const result = analyzeWorkbook([sheetOf([['comment', 'text']], [{ comment: 'hello' }])], ctx);
    expect(result.anomalies).toEqual([]);
    expect(result.stats[0]!.rowCount).toBe(1);
  });
});
