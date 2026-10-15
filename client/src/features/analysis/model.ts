import type { ChartSpec } from '../../api/types';
import type { Step } from '../../components/ui/Stepper';
import type { AnalysisStage } from '../../realtime/progress';

// ---------------------------------------------------------------------------------------------
// Failure codes (AnalysisError.code): each gets a calm message and the action that makes sense.
// Provider text is never shown; only these fixed strings.

export type FailureInfo = { title: string; body: string; retry: boolean; stage: AnalysisStage };

const FAILURES: Record<string, FailureInfo> = {
  LLM_REFUSED: {
    title: 'The AI model declined to write this summary',
    body: 'The model refused to process this request. It only ever received masked data, and nothing was sent to any other service. Running it again would give the same answer; contact your administrator if this keeps happening.',
    retry: false,
    stage: 'summarizing',
  },
  LLM_TIMEOUT: {
    title: 'The summary couldn’t be generated',
    body: 'The AI service did not respond in time. Your file is safe and unchanged; trying again usually works.',
    retry: true,
    stage: 'summarizing',
  },
  LLM_ERROR: {
    title: 'The AI service is unavailable',
    body: 'The summary service returned an error. Your file is safe; try again in a few minutes.',
    retry: true,
    stage: 'summarizing',
  },
  AGENT_FAILED: {
    title: 'The summary couldn’t be completed',
    body: 'The AI model did not return a valid summary. Your file is safe; trying again usually helps.',
    retry: true,
    stage: 'summarizing',
  },
  ANALYSIS_FAILED: {
    title: 'Something went wrong on our side',
    body: 'The analysis could not be completed. Your file is safe and still available; try again in a moment.',
    retry: true,
    stage: 'analyzing',
  },
};

/** Unknown or missing codes fall back to the generic failure. */
export const failureInfo = (code: string | null | undefined): FailureInfo =>
  (code && FAILURES[code]) || FAILURES.ANALYSIS_FAILED!;

// ---------------------------------------------------------------------------------------------
// Stepper: Parsing -> Analyzing -> Summarizing -> Done, driven by `analysis:progress`.
// The server reports parsing at 10%, analyzing at 40%, summarizing at 60% and done at 100%.

const STAGES: { stage: AnalysisStage; label: string; from: number; to: number }[] = [
  { stage: 'parsing', label: 'Parsing', from: 0, to: 40 },
  { stage: 'analyzing', label: 'Analyzing', from: 40, to: 60 },
  { stage: 'summarizing', label: 'Summarizing', from: 60, to: 100 },
  { stage: 'done', label: 'Done', from: 100, to: 100 },
];

export const STAGE_DETAIL: Record<AnalysisStage, string> = {
  parsing: 'Reading the sheets and their inferred columns',
  analyzing: 'Computing statistics and running the anomaly checks',
  summarizing: 'Writing the summary, risks and recommendations',
  done: 'Finished',
};

/** Steps for the current stage and percent; `failed` marks the current stage as failed. */
export function stepsFor(stage: AnalysisStage | null, percent: number, failed = false): Step[] {
  const current = stage ? STAGES.findIndex((s) => s.stage === stage) : 0;
  return STAGES.map((s, i) => {
    if (stage === 'done' && !failed) return { label: s.label, state: 'done', fill: 100 };
    if (i < current) return { label: s.label, state: 'done', fill: 100 };
    if (i > current) return { label: s.label, state: 'pending', fill: 0 };
    const span = s.to - s.from || 1;
    const fill = Math.max(8, Math.min(100, Math.round(((percent - s.from) / span) * 100)));
    return { label: s.label, state: failed ? 'failed' : 'current', fill };
  });
}

// ---------------------------------------------------------------------------------------------
// ChartSpec -> what to draw. Categorical bars become the design's horizontal bar list (labels can be
// tokens, which stay revealable); numeric bars and histograms become vertical bars; lines and pies map
// directly. Unknown types are skipped.

export type ChartGroup =
  | 'Anomaly overview'
  | 'Time series'
  | 'Distribution'
  | 'Top categories'
  | 'Activity'
  | 'Data quality'
  | 'Other';

const GROUPS: [string, ChartGroup][] = [
  ['anomalies-', 'Anomaly overview'],
  ['time-series', 'Time series'],
  ['histogram', 'Distribution'],
  ['top-values', 'Top categories'],
  ['hourly', 'Activity'],
  ['data-quality', 'Data quality'],
];

export const chartGroup = (id: string): ChartGroup => GROUPS.find(([p]) => id.startsWith(p))?.[1] ?? 'Other';

export type HBarRow = { label: string; value: number; width: number };
export type ChartView =
  | { kind: 'hbar'; rows: HBarRow[] }
  | { kind: 'vbar'; points: { x: string; y: number }[] }
  | { kind: 'line'; series: { name: string; points: { x: string; y: number }[] }[] }
  | {
      kind: 'severity';
      slices: { severity: 'HIGH' | 'MEDIUM' | 'LOW'; value: number; share: number }[];
      total: number;
    }
  | { kind: 'pie'; slices: { label: string; value: number; share: number }[]; total: number };

export type ChartModel = {
  view: ChartView;
  group: ChartGroup;
  notes: string[];
  bucket?: string;
  /** Axis labels with the unit, e.g. "Amount (AZN)". */
  xLabel?: string;
  yLabel?: string;
  unit?: string;
};

const withUnit = (label: string | undefined, unit: string | undefined) =>
  label && unit && !label.includes(unit) ? `${label} (${unit})` : label;

const pct = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);

export function chartModel(spec: ChartSpec): ChartModel | null {
  const series = spec.series ?? [];
  const first = series[0]?.points ?? [];
  const notes: string[] = [];
  if (spec.meta?.truncated) notes.push('Showing the latest 200 points; earlier periods are not drawn.');
  if (spec.meta?.note) notes.push(spec.meta.note);
  const base = { group: chartGroup(spec.id), notes, bucket: spec.meta?.bucket, unit: spec.unit };
  const axes = { xLabel: spec.xLabel, yLabel: withUnit(spec.yLabel, spec.unit) };

  switch (spec.type) {
    case 'bar': {
      if (first.every((p) => typeof p.x === 'number')) {
        return {
          ...base,
          ...axes,
          view: { kind: 'vbar', points: first.map((p) => ({ x: String(p.x), y: p.y })) },
        };
      }
      const max = Math.max(1, ...first.map((p) => p.y));
      return {
        ...base,
        xLabel: withUnit(spec.yLabel, spec.unit),
        view: {
          kind: 'hbar',
          rows: first.map((p) => ({ label: String(p.x), value: p.y, width: Math.round((p.y / max) * 100) })),
        },
      };
    }
    case 'histogram':
      return {
        ...base,
        xLabel: withUnit(spec.xLabel, spec.unit),
        yLabel: spec.yLabel,
        view: { kind: 'vbar', points: first.map((p) => ({ x: String(p.x), y: p.y })) },
      };
    case 'line':
      return {
        ...base,
        ...axes,
        view: {
          kind: 'line',
          series: series.map((s) => ({
            name: s.name,
            points: s.points.map((p) => ({ x: String(p.x), y: p.y })),
          })),
        },
      };
    case 'pie': {
      const total = first.reduce((n, p) => n + p.y, 0);
      if (first.every((p) => p.x === 'HIGH' || p.x === 'MEDIUM' || p.x === 'LOW')) {
        return {
          ...base,
          view: {
            kind: 'severity',
            total,
            slices: first.map((p) => ({
              severity: p.x as 'HIGH' | 'MEDIUM' | 'LOW',
              value: p.y,
              share: pct(p.y, total),
            })),
          },
        };
      }
      return {
        ...base,
        view: {
          kind: 'pie',
          total,
          slices: first.map((p) => ({ label: String(p.x), value: p.y, share: pct(p.y, total) })),
        },
      };
    }
    default:
      if (import.meta.env.DEV)
        console.warn(`Skipping chart ${spec.id}: unsupported type ${String(spec.type)}`);
      return null;
  }
}
