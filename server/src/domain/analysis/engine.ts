import { logger } from '../../lib/logger.js';
import { benfordRule } from './rules/benford.js';
import { dataQualityRule } from './rules/dataQuality.js';
import { duplicatesRule } from './rules/duplicates.js';
import { offHoursRule } from './rules/offHours.js';
import { outliersRule } from './rules/outliers.js';
import { roundAmountsRule } from './rules/roundAmounts.js';
import { structuringRule } from './rules/structuring.js';
import { computeSheetStats, type SheetStats } from './stats.js';
import type { Anomaly, AnalysisSheet, AnomalyRule, RuleContext, Severity } from './types.js';

/**
 * Bump whenever stats or rules change in a way that changes results. It is part of the analysis
 * cache key, so bumping it invalidates every cached analysis.
 */
export const ALGORITHM_VERSION = '1.0.0';

export const RULES: AnomalyRule[] = [
  outliersRule,
  duplicatesRule,
  roundAmountsRule,
  structuringRule,
  offHoursRule,
  benfordRule,
  dataQualityRule,
];

const SEVERITY_ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export type EngineResult = {
  algorithmVersion: string;
  stats: SheetStats[];
  anomalies: (Anomaly & { id: string })[];
  severityCounts: Record<Severity, number>;
  methodology: { ruleId: string; description: string }[];
};

/** Runs every rule on every sheet. A failing rule is logged and skipped so one bug cannot sink the analysis. */
export function analyzeWorkbook(sheets: AnalysisSheet[], ctx: RuleContext): EngineResult {
  const anomalies: Anomaly[] = [];
  for (const sheet of sheets) {
    for (const rule of RULES) {
      try {
        anomalies.push(...rule.run(sheet, ctx));
      } catch (err) {
        logger.error({ err, rule: rule.id, sheet: sheet.name }, 'anomaly rule failed');
      }
    }
  }
  anomalies.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.affectedCount - a.affectedCount,
  );

  return {
    algorithmVersion: ALGORITHM_VERSION,
    stats: sheets.map(computeSheetStats),
    // Stable ids let the LLM and the report reference a specific finding.
    anomalies: anomalies.map((a, i) => ({ id: `A${i + 1}`, ...a })),
    severityCounts: {
      HIGH: anomalies.filter((a) => a.severity === 'HIGH').length,
      MEDIUM: anomalies.filter((a) => a.severity === 'MEDIUM').length,
      LOW: anomalies.filter((a) => a.severity === 'LOW').length,
    },
    methodology: RULES.map((r) => ({ ruleId: r.id, description: r.description })),
  };
}
