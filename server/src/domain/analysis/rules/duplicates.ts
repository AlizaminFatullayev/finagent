import { toDate, toNumber, type Cell } from '../../ingest/values.js';
import { refs } from '../numeric.js';
import type { Anomaly, AnomalyRule, AnalysisSheet } from '../types.js';

/** Groups rows by a key and returns the groups that have more than one row. */
function duplicateGroups(sheet: AnalysisSheet, keyOf: (data: Record<string, Cell>) => string | null) {
  const groups = new Map<string, number[]>();
  for (const row of sheet.rows) {
    const key = keyOf(row.data);
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), row.rowIndex]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export const duplicatesRule: AnomalyRule = {
  id: 'duplicate-rows',
  description:
    'Exact duplicates (all cells equal) and near-duplicates (equal after ignoring ID columns, time of day, letter case and cent-level differences).',
  run(sheet) {
    if (sheet.rows.length < 2 || sheet.columns.length === 0) return [];
    const keys = sheet.columns.map((c) => c.key);
    const anomalies: Anomaly[] = [];

    const exact = duplicateGroups(sheet, (d) => JSON.stringify(keys.map((k) => d[k] ?? null)));
    const exactRows = new Set(exact.flat());
    if (exact.length) {
      const extra = exact.reduce((n, g) => n + g.length - 1, 0);
      anomalies.push({
        ruleId: this.id,
        type: 'exact_duplicate',
        severity: extra >= 5 ? 'HIGH' : 'MEDIUM',
        sheet: sheet.name,
        description: `${exact.length} group(s) of identical rows were found; ${extra} row(s) are exact copies of another row.`,
        rowIndexes: refs(exact.flat()),
        affectedCount: exactRows.size,
        metrics: {
          groups: exact.length,
          duplicateRows: extra,
          largestGroup: Math.max(...exact.map((g) => g.length)),
        },
      });
    }

    // IDs make every row unique and timestamps differ by seconds when a payment is entered twice,
    // so near-duplicates compare the remaining columns in a normalised form.
    const compared = sheet.columns.filter((c) => c.type !== 'id');
    if (compared.length === sheet.columns.length && !compared.some((c) => c.type === 'date'))
      return anomalies;
    const near = duplicateGroups(sheet, (d) => {
      const parts = compared.map((c) => {
        const v = d[c.key] ?? null;
        if (c.type === 'date') return toDate(v)?.toISOString().slice(0, 10) ?? v;
        if (c.type === 'currency' || c.type === 'number') {
          const n = toNumber(v);
          return n === null ? v : Math.round(n);
        }
        return typeof v === 'string' ? v.toLowerCase() : v;
      });
      // Rows that are mostly empty would all "match" each other.
      return parts.filter((p) => p !== null).length >= 2 ? JSON.stringify(parts) : null;
    }).filter((g) => g.some((r) => !exactRows.has(r)));

    if (near.length) {
      const rows = near.flat();
      anomalies.push({
        ruleId: this.id,
        type: 'near_duplicate',
        severity: near.length >= 5 ? 'MEDIUM' : 'LOW',
        sheet: sheet.name,
        description: `${near.length} group(s) of rows match on every non-ID column (same day, amount rounded to whole units), suggesting possible double entry.`,
        rowIndexes: refs(rows),
        affectedCount: rows.length,
        metrics: { groups: near.length, rows: rows.length, comparedColumns: compared.length },
      });
    }
    return anomalies;
  },
};
