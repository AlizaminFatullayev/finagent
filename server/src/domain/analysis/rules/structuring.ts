import { amountColumns, fmt, numericValues, refs, round } from '../numeric.js';
import type { Anomaly, AnomalyRule } from '../types.js';

// "Just below" = within 10% under the reporting threshold, compared with the same width above it.
const BAND = 0.1;
const MIN_BELOW = 3;
const RATIO_LIMIT = 2;

export const structuringRule: AnomalyRule = {
  id: 'structuring',
  description: `Amounts in the ${BAND * 100}% band just below the reporting threshold (ANOMALY_THRESHOLD_AMOUNT) compared with the equally wide band just above it; flagged when at least ${MIN_BELOW} sit below and they outnumber those above ${RATIO_LIMIT}:1.`,
  run(sheet, ctx) {
    const t = ctx.thresholdAmount;
    const anomalies: Anomaly[] = [];
    for (const col of amountColumns(sheet)) {
      const values = numericValues(sheet, col.key).map((v) => ({ ...v, value: Math.abs(v.value) }));
      const below = values.filter((v) => v.value >= t * (1 - BAND) && v.value < t);
      const above = values.filter((v) => v.value >= t && v.value < t * (1 + BAND));
      const ratio = below.length / Math.max(above.length, 1);
      if (below.length < MIN_BELOW || ratio < RATIO_LIMIT) continue;
      anomalies.push({
        ruleId: this.id,
        type: 'structuring',
        severity: below.length >= 10 || ratio >= 5 ? 'HIGH' : 'MEDIUM',
        sheet: sheet.name,
        column: col.name,
        description: `${below.length} amount(s) in "${col.name}" fall between ${fmt(t * (1 - BAND))} and the ${fmt(t)} threshold, versus ${above.length} just above it — a pattern consistent with splitting payments to avoid reporting.`,
        rowIndexes: refs(below.map((v) => v.rowIndex)),
        affectedCount: below.length,
        metrics: {
          threshold: t,
          bandLow: round(t * (1 - BAND), 2),
          bandHigh: round(t * (1 + BAND), 2),
          countJustBelow: below.length,
          countJustAbove: above.length,
          ratio: round(ratio, 2),
        },
      });
    }
    return anomalies;
  },
};
