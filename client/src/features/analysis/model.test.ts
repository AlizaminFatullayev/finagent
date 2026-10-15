import { describe, expect, it, vi } from 'vitest';
import type { ChartSpec } from '../../api/types';
import { chartGroup, chartModel, failureInfo, stepsFor } from './model';

const spec = (over: Partial<ChartSpec>): ChartSpec => ({
  id: 'x:0',
  type: 'bar',
  title: 'T',
  sheetId: '00000000-0000-4000-8000-000000000001',
  series: [{ name: 'Count', points: [] }],
  ...over,
});

describe('chartModel', () => {
  it('maps categorical bars to the design hbar list, keeping token labels', () => {
    const m = chartModel(
      spec({
        id: 'top-values:0:customer',
        yLabel: 'Count',
        series: [
          {
            name: 'Count',
            points: [
              { x: '[PERSON_1]', y: 10 },
              { x: '[PERSON_2]', y: 5 },
            ],
          },
        ],
      }),
    )!;
    expect(m.group).toBe('Top categories');
    expect(m.view).toEqual({
      kind: 'hbar',
      rows: [
        { label: '[PERSON_1]', value: 10, width: 100 },
        { label: '[PERSON_2]', value: 5, width: 50 },
      ],
    });
  });

  it('maps numeric bars (hourly) and histograms to vertical bars with axis labels and unit', () => {
    const hourly = chartModel(
      spec({
        id: 'hourly:0:date',
        xLabel: 'Hour',
        yLabel: 'Count',
        meta: { bucket: 'hour' },
        series: [
          {
            name: 'Count',
            points: [
              { x: 0, y: 3 },
              { x: 1, y: 4 },
            ],
          },
        ],
      }),
    )!;
    expect(hourly).toMatchObject({
      group: 'Activity',
      bucket: 'hour',
      xLabel: 'Hour',
      view: {
        kind: 'vbar',
        points: [
          { x: '0', y: 3 },
          { x: '1', y: 4 },
        ],
      },
    });
    const hist = chartModel(
      spec({
        id: 'histogram:0:amount',
        type: 'histogram',
        xLabel: 'Amount',
        unit: 'AZN',
        series: [{ name: 'Count', points: [{ x: 0, y: 1 }] }],
      }),
    )!;
    expect(hist).toMatchObject({ group: 'Distribution', xLabel: 'Amount (AZN)', view: { kind: 'vbar' } });
  });

  it('keeps every line series and surfaces truncation and notes', () => {
    const m = chartModel(
      spec({
        id: 'time-series:0:date',
        type: 'line',
        yLabel: 'Amount',
        unit: 'AZN',
        meta: { truncated: true, bucket: 'month', note: '12 rows without a date are excluded' },
        series: [
          { name: 'Sum', points: [{ x: '2026-01', y: 10 }] },
          { name: 'Count', points: [{ x: '2026-01', y: 2 }] },
        ],
      }),
    )!;
    expect(m.view.kind === 'line' && m.view.series.map((s) => s.name)).toEqual(['Sum', 'Count']);
    expect(m.yLabel).toBe('Amount (AZN)');
    expect(m.bucket).toBe('month');
    expect(m.notes).toEqual([
      'Showing the latest 200 points; earlier periods are not drawn.',
      '12 rows without a date are excluded',
    ]);
  });

  it('draws severity pies with severity slices and shares, other pies with labels', () => {
    const sev = chartModel(
      spec({
        id: 'anomalies-by-severity:0',
        type: 'pie',
        series: [
          {
            name: 'n',
            points: [
              { x: 'HIGH', y: 1 },
              { x: 'LOW', y: 3 },
            ],
          },
        ],
      }),
    )!;
    expect(sev.view).toEqual({
      kind: 'severity',
      total: 4,
      slices: [
        { severity: 'HIGH', value: 1, share: 25 },
        { severity: 'LOW', value: 3, share: 75 },
      ],
    });
    const pie = chartModel(spec({ type: 'pie', series: [{ name: 'n', points: [{ x: 'ATM', y: 1 }] }] }))!;
    expect(pie.view.kind).toBe('pie');
  });

  it('skips unknown chart types instead of failing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(chartModel(spec({ type: 'radar' as ChartSpec['type'] }))).toBeNull();
  });

  it('groups by id prefix', () => {
    expect(chartGroup('anomalies-by-type:0')).toBe('Anomaly overview');
    expect(chartGroup('data-quality:1')).toBe('Data quality');
    expect(chartGroup('something:1')).toBe('Other');
  });
});

describe('failureInfo', () => {
  it('gives each known code its own message and action', () => {
    expect(failureInfo('LLM_REFUSED')).toMatchObject({ retry: false, stage: 'summarizing' });
    expect(failureInfo('LLM_REFUSED').body).toMatch(/only ever received masked data/);
    expect(failureInfo('LLM_TIMEOUT')).toMatchObject({
      retry: true,
      title: 'The summary couldn’t be generated',
    });
    expect(failureInfo('LLM_ERROR').retry).toBe(true);
    expect(failureInfo('AGENT_FAILED').retry).toBe(true);
    const titles = ['LLM_REFUSED', 'LLM_TIMEOUT', 'LLM_ERROR', 'AGENT_FAILED', 'ANALYSIS_FAILED'].map(
      (c) => failureInfo(c).title,
    );
    expect(new Set(titles).size).toBe(5);
  });

  it('falls back to the generic failure for unknown or missing codes', () => {
    expect(failureInfo('SOMETHING_NEW')).toEqual(failureInfo('ANALYSIS_FAILED'));
    expect(failureInfo(null)).toEqual(failureInfo('ANALYSIS_FAILED'));
  });
});

describe('stepsFor', () => {
  const states = (s: ReturnType<typeof stepsFor>) => s.map((x) => x.state);

  it('follows the analysis:progress stages', () => {
    expect(states(stepsFor(null, 0))).toEqual(['current', 'pending', 'pending', 'pending']);
    expect(states(stepsFor('parsing', 10))).toEqual(['current', 'pending', 'pending', 'pending']);
    expect(states(stepsFor('analyzing', 40))).toEqual(['done', 'current', 'pending', 'pending']);
    expect(states(stepsFor('summarizing', 60))).toEqual(['done', 'done', 'current', 'pending']);
    expect(states(stepsFor('done', 100))).toEqual(['done', 'done', 'done', 'done']);
  });

  it('fills the current step proportionally, never empty', () => {
    expect(stepsFor('parsing', 10)[0]!.fill).toBe(25);
    expect(stepsFor('summarizing', 60)[2]!.fill).toBe(8);
  });

  it('marks the stage that failed', () => {
    expect(states(stepsFor('summarizing', 60, true))).toEqual(['done', 'done', 'failed', 'pending']);
  });
});
