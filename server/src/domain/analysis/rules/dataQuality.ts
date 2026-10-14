import { toBoolean, toDate, toNumber, type Cell } from '../../ingest/values.js';
import { amountColumns, numericValues, refs, round } from '../numeric.js';
import type { Anomaly, AnomalyRule } from '../types.js';

const NULL_SPIKE = 0.2;
const MIN_ROWS = 10;

// How each typed column recognises a valid value; text and id accept anything.
const conforms: Partial<Record<string, (v: Cell) => boolean>> = {
  number: (v) => toNumber(v) !== null,
  currency: (v) => toNumber(v) !== null,
  percent: (v) => toNumber(v) !== null,
  date: (v) => toDate(v) !== null,
  boolean: (v) => toBoolean(v) !== null,
};

export const dataQualityRule: AnomalyRule = {
  id: 'data-quality',
  description: `Columns with more than ${NULL_SPIKE * 100}% empty cells, cells whose type does not match their column, and rare negative amounts in otherwise positive columns.`,
  run(sheet) {
    if (sheet.rows.length < MIN_ROWS) return [];
    const anomalies: Anomaly[] = [];
    const base = { ruleId: this.id, sheet: sheet.name };

    for (const col of sheet.columns) {
      const empty = sheet.rows.filter((r) => r.data[col.key] == null);
      const share = empty.length / sheet.rows.length;
      // A column that is almost entirely empty is optional by design, not a quality problem.
      if (share > NULL_SPIKE && share < 0.95) {
        anomalies.push({
          ...base,
          type: 'null_spike',
          severity: share >= 0.5 ? 'MEDIUM' : 'LOW',
          column: col.name,
          description: `${round(share * 100, 1)}% of cells in "${col.name}" are empty (${empty.length} of ${sheet.rows.length}).`,
          rowIndexes: refs(empty.map((r) => r.rowIndex)),
          affectedCount: empty.length,
          metrics: { emptyCount: empty.length, total: sheet.rows.length, emptyShare: round(share) },
        });
      }

      const test = conforms[col.type];
      if (test) {
        const bad = sheet.rows.filter((r) => r.data[col.key] != null && !test(r.data[col.key]!));
        if (bad.length) {
          anomalies.push({
            ...base,
            type: 'mixed_types',
            severity: bad.length >= 10 ? 'MEDIUM' : 'LOW',
            column: col.name,
            description: `${bad.length} cell(s) in the ${col.type} column "${col.name}" hold values of another type.`,
            rowIndexes: refs(bad.map((r) => r.rowIndex)),
            affectedCount: bad.length,
            metrics: { invalidCount: bad.length, expectedType: col.type },
          });
        }
      }
    }

    for (const col of amountColumns(sheet)) {
      const values = numericValues(sheet, col.key);
      const negative = values.filter((v) => v.value < 0);
      // Columns with many negatives are signed by design (debits/credits); a handful is suspicious.
      if (negative.length > 0 && negative.length / values.length < 0.05) {
        anomalies.push({
          ...base,
          type: 'unusual_negative',
          severity: 'LOW',
          column: col.name,
          description: `${negative.length} negative value(s) appear in "${col.name}", where ${values.length - negative.length} of ${values.length} values are non-negative.`,
          rowIndexes: refs(negative.map((v) => v.rowIndex)),
          affectedCount: negative.length,
          metrics: { negativeCount: negative.length, total: values.length },
        });
      }
    }
    return anomalies;
  },
};
