import { amountColumns, numericValues, refs, round } from '../numeric.js';
import type { Anomaly, AnomalyRule } from '../types.js';

const MIN_VALUES = 100;
// Nigrini's first-digit MAD bands: above 0.015 is "nonconformity".
const MAD_NONCONFORMING = 0.015;
const MAD_SEVERE = 0.025;

const expected = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));

const firstDigit = (n: number) => Number(String(Math.abs(n)).replace(/^[0.]+/, '')[0]);

export const benfordRule: AnomalyRule = {
  id: 'benford-first-digit',
  description: `First-digit distribution of amounts ≥ 10 compared with Benford's law using mean absolute deviation (Nigrini); requires ≥ ${MIN_VALUES} values, flagged above MAD ${MAD_NONCONFORMING}.`,
  run(sheet) {
    const anomalies: Anomaly[] = [];
    for (const col of amountColumns(sheet)) {
      // Values below 10 and zero have no meaningful leading digit for this test.
      const values = numericValues(sheet, col.key).filter((v) => Math.abs(v.value) >= 10);
      if (values.length < MIN_VALUES) continue;

      const counts = Array<number>(9).fill(0);
      for (const v of values) counts[firstDigit(v.value) - 1]! += 1;
      const observed = counts.map((c) => c / values.length);
      const deviations = observed.map((o, i) => o - expected[i]!);
      const mad = deviations.reduce((s, d) => s + Math.abs(d), 0) / 9;
      const chiSquare = counts.reduce(
        (s, c, i) => s + (c - expected[i]! * values.length) ** 2 / (expected[i]! * values.length),
        0,
      );
      if (mad <= MAD_NONCONFORMING) continue;

      const worst = deviations.indexOf(Math.max(...deviations)) + 1;
      const worstRows = values.filter((v) => firstDigit(v.value) === worst).map((v) => v.rowIndex);
      anomalies.push({
        ruleId: this.id,
        type: 'benford_deviation',
        severity: mad > MAD_SEVERE ? 'HIGH' : 'MEDIUM',
        sheet: sheet.name,
        column: col.name,
        description: `Leading digits of "${col.name}" deviate from Benford's law (MAD ${round(mad)}, above ${MAD_NONCONFORMING}); digit ${worst} appears in ${round(observed[worst - 1]! * 100, 1)}% of amounts versus ${round(expected[worst - 1]! * 100, 1)}% expected.`,
        rowIndexes: refs(worstRows),
        affectedCount: worstRows.length,
        metrics: {
          sampleSize: values.length,
          mad: round(mad),
          chiSquare: round(chiSquare, 2),
          mostOverrepresentedDigit: worst,
          observedShare: round(observed[worst - 1]!),
          expectedShare: round(expected[worst - 1]!),
        },
      });
    }
    return anomalies;
  },
};
