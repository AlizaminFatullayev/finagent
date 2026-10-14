import type { ColumnSchema, ColumnType } from '../ingest/schema.js';
import type { Cell } from '../ingest/values.js';

/** One sheet as the analysis engine sees it: inferred columns plus raw rows. */
export type AnalysisSheet = {
  name: string;
  columns: ColumnSchema[];
  rows: { rowIndex: number; data: Record<string, Cell> }[];
};

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export type Anomaly = {
  ruleId: string;
  type: string;
  severity: Severity;
  sheet: string;
  column?: string;
  /** Plain-language statement built only from the numbers in `metrics`. */
  description: string;
  /** Worksheet row numbers, capped for payload size; `affectedCount` is the full count. */
  rowIndexes: number[];
  affectedCount: number;
  /** The exact figures behind the finding, so the narrative can cite them and auditors can re-check. */
  metrics: Record<string, number | string>;
};

export type RuleContext = { thresholdAmount: number };

export interface AnomalyRule {
  id: string;
  /** One line for the report's methodology section. */
  description: string;
  /** Returns [] when the sheet lacks the column types the rule needs. */
  run(sheet: AnalysisSheet, ctx: RuleContext): Anomaly[];
}

export const NUMERIC_TYPES: ColumnType[] = ['number', 'currency', 'percent'];
