import { dateValues, refs, round } from '../numeric.js';
import type { Anomaly, AnomalyRule } from '../types.js';

// Branch working hours; times are the wall-clock values as written in the sheet.
const WORK_START = 8;
const WORK_END = 20;
const MIN_COUNT = 3;
const BURST_WINDOW_MS = 60 * 60 * 1000;
const BURST_SIZE = 5;

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
const isOffHours = (d: Date) => d.getUTCHours() < WORK_START || d.getUTCHours() >= WORK_END;
const hasTime = (d: Date) => d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() > 0;

export const offHoursRule: AnomalyRule = {
  id: 'off-hours-activity',
  description: `Weekend activity, activity outside ${WORK_START}:00–${WORK_END}:00 (when times are present), and bursts of ≥${BURST_SIZE} off-hours entries within one hour.`,
  run(sheet) {
    const anomalies: Anomaly[] = [];
    for (const col of sheet.columns.filter((c) => c.type === 'date')) {
      const values = dateValues(sheet, col.key);
      if (values.length < MIN_COUNT) continue;

      const weekend = values.filter((v) => isWeekend(v.value));
      if (weekend.length >= MIN_COUNT && weekend.length / values.length >= 0.05) {
        const share = weekend.length / values.length;
        anomalies.push({
          ruleId: this.id,
          type: 'weekend_activity',
          severity: share >= 0.2 ? 'MEDIUM' : 'LOW',
          sheet: sheet.name,
          column: col.name,
          description: `${weekend.length} of ${values.length} entries in "${col.name}" (${round(share * 100, 1)}%) fall on a Saturday or Sunday.`,
          rowIndexes: refs(weekend.map((v) => v.rowIndex)),
          affectedCount: weekend.length,
          metrics: { weekendCount: weekend.length, total: values.length, weekendShare: round(share) },
        });
      }

      // Date-only columns would put everything at midnight, which is not "off-hours".
      if (!values.some((v) => hasTime(v.value))) continue;
      const off = values
        .filter((v) => isOffHours(v.value))
        .sort((a, b) => a.value.getTime() - b.value.getTime());
      if (off.length >= MIN_COUNT) {
        const share = off.length / values.length;
        anomalies.push({
          ruleId: this.id,
          type: 'off_hours_activity',
          severity: share >= 0.2 ? 'MEDIUM' : 'LOW',
          sheet: sheet.name,
          column: col.name,
          description: `${off.length} of ${values.length} entries in "${col.name}" (${round(share * 100, 1)}%) are timestamped before ${WORK_START}:00 or after ${WORK_END}:00.`,
          rowIndexes: refs(off.map((v) => v.rowIndex)),
          affectedCount: off.length,
          metrics: {
            offHoursCount: off.length,
            total: values.length,
            offHoursShare: round(share),
            workStart: WORK_START,
            workEnd: WORK_END,
          },
        });
      }

      // Sliding window over sorted off-hours times: many entries in one night hour is a stronger signal.
      const burstRows = new Set<number>();
      let start = 0;
      for (let end = 0; end < off.length; end++) {
        while (off[end]!.value.getTime() - off[start]!.value.getTime() > BURST_WINDOW_MS) start++;
        if (end - start + 1 >= BURST_SIZE) for (let i = start; i <= end; i++) burstRows.add(off[i]!.rowIndex);
      }
      if (burstRows.size) {
        anomalies.push({
          ruleId: this.id,
          type: 'off_hours_burst',
          severity: 'HIGH',
          sheet: sheet.name,
          column: col.name,
          description: `${burstRows.size} off-hours entries in "${col.name}" occur in bursts of at least ${BURST_SIZE} within one hour.`,
          rowIndexes: refs([...burstRows]),
          affectedCount: burstRows.size,
          metrics: {
            burstRows: burstRows.size,
            burstSize: BURST_SIZE,
            windowMinutes: BURST_WINDOW_MS / 60_000,
          },
        });
      }
    }
    return anomalies;
  },
};
