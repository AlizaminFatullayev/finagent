import { amountColumns, fmt, numericValues, refs, round } from '../numeric.js';
import type { Anomaly, AnomalyRule } from '../types.js';

const MIN_VALUES = 20;
const ROUND_UNIT = 1_000;
// Organic amounts (fees, interest, invoices) are rarely exact thousands; a high share points to
// estimates, manual entries or fabricated figures.
const SHARE_LIMIT = 0.25;

export const roundAmountsRule: AnomalyRule = {
  id: 'round-amounts',
  description: `Share of amounts ≥ ${ROUND_UNIT} that are exact multiples of ${ROUND_UNIT}; flagged above ${SHARE_LIMIT * 100}% (min ${MIN_VALUES} values).`,
  run(sheet) {
    const anomalies: Anomaly[] = [];
    for (const col of amountColumns(sheet)) {
      const values = numericValues(sheet, col.key).filter((v) => Math.abs(v.value) >= ROUND_UNIT);
      if (values.length < MIN_VALUES) continue;
      const rounded = values.filter((v) => v.value % ROUND_UNIT === 0);
      const share = rounded.length / values.length;
      if (share < SHARE_LIMIT || rounded.length < 5) continue;
      anomalies.push({
        ruleId: this.id,
        type: 'round_amount_cluster',
        severity: share >= 0.4 ? 'MEDIUM' : 'LOW',
        sheet: sheet.name,
        column: col.name,
        description: `${round(share * 100, 1)}% of amounts ≥ ${fmt(ROUND_UNIT)} in "${col.name}" are exact multiples of ${fmt(ROUND_UNIT)} (${rounded.length} of ${values.length}).`,
        rowIndexes: refs(rounded.map((v) => v.rowIndex)),
        affectedCount: rounded.length,
        metrics: {
          roundCount: rounded.length,
          eligibleCount: values.length,
          roundShare: round(share),
          unit: ROUND_UNIT,
        },
      });
    }
    return anomalies;
  },
};
