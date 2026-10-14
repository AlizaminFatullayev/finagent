import type { Summary } from '../../domain/agent/schemas.js';
import type { Anomaly } from '../../domain/analysis/types.js';

export type ReportData = {
  title: string;
  fileName: string;
  generatedAt: Date;
  language: 'az' | 'en';
  model: string | null;
  summary: Summary;
  anomalies: (Anomaly & { id: string })[];
  severityCounts: Record<string, number>;
  methodology: { ruleId: string; description: string }[];
  algorithmVersion: string;
  verification: { checked: number; verified: number } | null;
};

export const METHODOLOGY_NOTE =
  'All statistics and anomalies were computed deterministically by FinAgent rules. The narrative was written by a language model that saw only masked data and the computed results; numbers it cites are cross-checked against those results. Personal data appears as tokens (e.g. [PERSON_1]).';
