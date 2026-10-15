import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SeverityBadge } from '../../components/ui/Badge';
import { Segmented } from '../../components/ui/Controls';
import { formatNumber } from '../../lib/format';
import { isToken } from '../../lib/tokens';
import { Token } from '../reveal/Token';
import { useChartColors, type ChartColors } from './chartColors';
import type { ChartModel } from './model';

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
/** Axis ticks stay short (1.4M, 700K) so they never clip. */
const tick = (v: number) => (Math.abs(v) >= 10_000 ? compactFmt.format(v) : fmt(v));
const fmt = (v: number) => (Number.isInteger(v) ? formatNumber(v) : formatNumber(Math.round(v * 100) / 100));
const withUnit = (v: number, unit?: string) =>
  unit === '%' ? `${fmt(v)}%` : unit ? `${fmt(v)} ${unit}` : fmt(v);

/** Tooltip in the design's `.tooltip` style (dark on light, light on dark). */
function ChartTip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { value?: unknown; name?: unknown }[];
  label?: unknown;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <span className="mono" style={{ fontSize: 12 }}>
        {String(label)}
      </span>
      {payload.map((p, i) => (
        <span key={i}>
          {payload.length > 1 && `${String(p.name)} `}
          <span className="mono">
            {typeof p.value === 'number' ? withUnit(p.value, unit) : String(p.value)}
          </span>
        </span>
      ))}
    </div>
  );
}

const axisProps = (c: ChartColors) => ({
  stroke: c['border-strong'],
  tick: { fill: c['text-muted'], fontSize: 11, fontFamily: 'var(--font-mono)' },
  tickLine: false,
});

/** Draws one chart model. `height` grows in full screen. */
export function ChartBody({
  model,
  height = 160,
  title,
  compact,
}: {
  model: ChartModel;
  height?: number;
  title: string;
  /** Result-page tiles: tighter bar labels, donut total in the middle, first series only. */
  compact?: boolean;
}) {
  const c = useChartColors();
  const [seriesIndex, setSeriesIndex] = useState(0);
  const { view } = model;

  if (view.kind === 'hbar') {
    return (
      <div className="col" style={{ gap: 8 }}>
        <ul className="col" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }} aria-label={title}>
          {view.rows.map((r, i) => (
            <li
              key={i}
              className="hbar"
              style={compact ? { gridTemplateColumns: '128px 1fr 24px', fontSize: 12 } : undefined}
            >
              <span className="ellipsis">
                {isToken(r.label) ? (
                  <Token token={r.label} />
                ) : (
                  <span className="sec" title={r.label}>
                    {r.label}
                  </span>
                )}
              </span>
              <span className="tr" aria-hidden="true">
                <i
                  style={{
                    width: `${r.width}%`,
                    background: model.group === 'Data quality' ? 'var(--chart-4)' : 'var(--chart-1)',
                  }}
                />
              </span>
              <span className="mono" style={{ textAlign: 'right', fontSize: 12 }}>
                {withUnit(r.value, model.unit === '%' ? '%' : undefined)}
              </span>
            </li>
          ))}
        </ul>
        {model.xLabel && !compact && (
          <span className="t12 muted" style={{ textAlign: 'right' }}>
            {model.xLabel}
          </span>
        )}
      </div>
    );
  }

  if (view.kind === 'severity' || view.kind === 'pie') {
    const slices =
      view.kind === 'severity'
        ? view.slices.map((s) => ({
            key: s.severity,
            value: s.value,
            share: s.share,
            color:
              s.severity === 'HIGH'
                ? c['sev-high-fg']
                : s.severity === 'MEDIUM'
                  ? c['sev-med-fg']
                  : c['chart-3'],
            label: <SeverityBadge severity={s.severity} />,
          }))
        : view.slices.map((s, i) => ({
            key: s.label,
            value: s.value,
            share: s.share,
            color: c[`chart-${(i % 5) + 1}` as 'chart-1'],
            label: (
              <span className="row" style={{ gap: 6 }}>
                <i className="sw" style={{ background: c[`chart-${(i % 5) + 1}` as 'chart-1'] }} />
                {s.label}
              </span>
            ),
          }));
    const size = Math.min(height, 200);
    return (
      <div
        className="row wrap"
        style={{
          gap: compact ? 24 : 32,
          justifyContent: compact ? 'flex-start' : 'center',
          padding: compact ? 0 : '12px 0',
        }}
      >
        <div
          style={{ width: size, height: size, position: 'relative' }}
          role="img"
          aria-label={`${title}: ${slices.map((s) => `${s.value} ${s.key.toLowerCase()}`).join(', ')}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="key"
                innerRadius="55%"
                outerRadius="85%"
                stroke="none"
                isAnimationActive={false}
              >
                {slices.map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {compact && (
            <div
              className="col"
              style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
              aria-hidden="true"
            >
              <span className="mono w6" style={{ fontSize: 22, lineHeight: '26px' }}>
                {formatNumber(view.total)}
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                total
              </span>
            </div>
          )}
        </div>
        {/* Direct labels with counts: severity is never color alone. */}
        <div className="col" style={{ gap: 12 }}>
          {slices.map((s) => (
            <div key={s.key} className="row" style={{ gap: 8 }}>
              {s.label}
              <span className="mono">
                {compact ? formatNumber(s.value) : `${formatNumber(s.value)} · ${s.share}%`}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const tip = <Tooltip content={<ChartTip unit={model.unit} />} cursor={{ fill: c['surface-tertiary'] }} />;
  const grid = <CartesianGrid vertical={false} stroke={c['chart-grid']} />;
  return (
    <div className="col" style={{ gap: 6 }}>
      {view.kind === 'line' && view.series.length > 1 && !compact && (
        <Segmented
          label="Series"
          value={String(seriesIndex)}
          onChange={(v) => setSeriesIndex(Number(v))}
          options={view.series.map((s, i) => ({ value: String(i), label: s.name }))}
          className="self-start"
        />
      )}
      {model.yLabel && (
        <span className="t12 muted">
          {view.kind === 'line' && view.series.length > 1
            ? `${view.series[seriesIndex]?.name} · ${model.yLabel}`
            : model.yLabel}
        </span>
      )}
      <div style={{ height }} role="img" aria-label={title}>
        <ResponsiveContainer width="100%" height="100%">
          {view.kind === 'line' ? (
            <LineChart
              data={view.series[seriesIndex]?.points ?? []}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              {grid}
              <XAxis dataKey="x" {...axisProps(c)} minTickGap={24} />
              <YAxis {...axisProps(c)} axisLine={false} width={56} tickFormatter={tick} />
              {tip}
              <Line
                dataKey="y"
                name={view.series[seriesIndex]?.name}
                stroke={c['chart-1']}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <BarChart data={view.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={1}>
              {grid}
              <XAxis dataKey="x" {...axisProps(c)} minTickGap={16} />
              <YAxis {...axisProps(c)} axisLine={false} width={48} tickFormatter={tick} />
              {tip}
              <Bar
                dataKey="y"
                name={model.yLabel ?? 'Count'}
                fill={c['chart-1']}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {model.xLabel && (
        <span className="t12 muted" style={{ textAlign: 'center' }}>
          {model.xLabel}
        </span>
      )}
    </div>
  );
}
