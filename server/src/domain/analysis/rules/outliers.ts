import { fmt, mean, numericValues, quantile, refs, round, stddev } from '../numeric.js';
import type { Anomaly, AnomalyRule } from '../types.js';

const MIN_VALUES = 10;
// 3×IQR ("extreme" fences) instead of Tukey's 1.5×: financial amounts are naturally skewed,
// and 1.5× would flag a large share of perfectly normal big payments.
const IQR_FACTOR = 3;
const Z_LIMIT = 3.5;

export const outliersRule: AnomalyRule = {
  id: 'statistical-outliers',
  description: `Values beyond Q1/Q3 ± ${IQR_FACTOR}×IQR or with |z-score| ≥ ${Z_LIMIT}, per numeric column with at least ${MIN_VALUES} values.`,
  run(sheet) {
    const anomalies: Anomaly[] = [];
    for (const col of sheet.columns.filter((c) => c.type === 'number' || c.type === 'currency')) {
      const values = numericValues(sheet, col.key);
      if (values.length < MIN_VALUES) continue;
      const sorted = values.map((v) => v.value).sort((a, b) => a - b);
      const q1 = quantile(sorted, 0.25);
      const q3 = quantile(sorted, 0.75);
      const iqr = q3 - q1;
      const lower = q1 - IQR_FACTOR * iqr;
      const upper = q3 + IQR_FACTOR * iqr;
      const m = mean(sorted);
      const sd = stddev(sorted);

      const flagged = values.filter(
        (v) =>
          (iqr > 0 && (v.value < lower || v.value > upper)) ||
          (sd > 0 && Math.abs(v.value - m) / sd >= Z_LIMIT),
      );
      if (flagged.length === 0) continue;

      const maxZ = sd > 0 ? Math.max(...flagged.map((v) => Math.abs(v.value - m) / sd)) : 0;
      const extreme = flagged.reduce((a, b) => (Math.abs(b.value - m) > Math.abs(a.value - m) ? b : a));
      anomalies.push({
        ruleId: this.id,
        type: 'outlier',
        severity: maxZ >= 6 ? 'HIGH' : maxZ >= Z_LIMIT ? 'MEDIUM' : 'LOW',
        sheet: sheet.name,
        column: col.name,
        description: `${flagged.length} value(s) in "${col.name}" fall outside the expected range ${fmt(lower)} to ${fmt(upper)}; the most extreme is ${fmt(extreme.value)} (row ${extreme.rowIndex}).`,
        rowIndexes: refs(flagged.map((v) => v.rowIndex)),
        affectedCount: flagged.length,
        metrics: {
          count: values.length,
          q1: round(q1),
          q3: round(q3),
          iqr: round(iqr),
          lowerFence: round(lower),
          upperFence: round(upper),
          mean: round(m),
          stddev: round(sd),
          maxAbsZScore: round(maxZ),
          mostExtremeValue: extreme.value,
        },
      });
    }
    return anomalies;
  },
};
