import { Accordion } from 'radix-ui';
import { type ReactNode } from 'react';
import type { Analysis, Anomaly } from '../../api/types';
import { SeverityBadge } from '../../components/ui/Badge';
import { ButtonLink } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Banner, Skeleton } from '../../components/ui/Surfaces';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatDateTime, formatNumber, formatShortDateTime } from '../../lib/format';
import { RevealProvider } from '../reveal/RevealProvider';
import { RevealBanner, TokenText } from '../reveal/Token';
import { ChartBody } from './ChartBody';
import { ExportMenu } from './ExportMenu';
import { chartModel } from './model';
import { useCharts } from './queries';

const LANGUAGE = { en: 'English', az: 'Azərbaycan' } as const;

type Item = { text: string; severity?: Anomaly['severity']; prefix?: string };
type Section = { key: string; title: string; items: Item[] };

/** Result (Result.html, ResultAz/Dark/Mobile). Reveal works on tokens in every narrative string. */
export function ResultView({ analysis, fileName }: { analysis: Analysis; fileName: string }) {
  return (
    <RevealProvider fileId={analysis.fileId} key={analysis.id}>
      <Result analysis={analysis} fileName={fileName} />
    </RevealProvider>
  );
}

function Result({ analysis, fileName }: { analysis: Analysis; fileName: string }) {
  const mobile = useIsMobile();
  const result = analysis.result!;
  const summary = result.summary;
  const charts = useCharts(analysis.id, true);
  const unverified = analysis.verification?.unverified ?? [];
  const isUnverified = (text: string) => unverified.some((n) => text.includes(n));
  const byId = new Map(result.anomalies.map((a) => [a.id, a]));
  const counts = {
    HIGH: result.severityCounts.HIGH ?? 0,
    MEDIUM: result.severityCounts.MEDIUM ?? 0,
    LOW: result.severityCounts.LOW ?? 0,
  };
  const total = result.anomalies.length;

  const sections: Section[] = [
    { key: 'trends', title: 'Trends', items: summary.trends.map((text) => ({ text })) },
    { key: 'risks', title: 'Risks', items: summary.risks.map((text) => ({ text })) },
    { key: 'recs', title: 'Recommendations', items: summary.recommendations.map((text) => ({ text })) },
    {
      key: 'anoms',
      title: 'Anomaly highlights',
      items: summary.anomalyHighlights.map((h) => {
        const a = byId.get(h.anomalyId);
        return { text: h.comment, severity: a?.severity, prefix: a ? `${a.type}: ` : undefined };
      }),
    },
    { key: 'cav', title: 'Caveats', items: summary.caveats.map((text) => ({ text })) },
  ].filter((s) => s.items.length > 0);

  // "Weekly volume"-style activity: the first time series of the chart set.
  const chartSpecs = charts.data?.charts ?? [];
  const activity = chartSpecs.find((c) => c.type === 'line');
  const byType = chartSpecs.find((c) => c.id.startsWith('anomalies-by-type'));
  const severity = chartSpecs.find((c) => c.id.startsWith('anomalies-by-severity'));

  const chips = (
    <>
      <span className="chip">
        <Icon name="globe" />
        {LANGUAGE[analysis.language]}
      </span>
      {analysis.model && <span className="chip mono">{analysis.model}</span>}
      <span className="chip">
        {(mobile ? formatShortDateTime : formatDateTime)(analysis.completedAt ?? analysis.createdAt)}
      </span>
      {analysis.cached && (
        <span className="chip">
          <Icon name="refresh" />
          Cached result
        </span>
      )}
      {result.fallbackFrom && <span className="chip">Fallback model (primary declined)</span>}
    </>
  );
  const unverifiedBanner = unverified.length > 0 && (
    <Banner
      kind="warn"
      icon="info"
      title={`${unverified.length} unverified ${unverified.length === 1 ? 'figure' : 'figures'}`}
    >
      Not matched to computed data; they are marked in the text. See Caveats.
    </Banner>
  );

  if (mobile) {
    return (
      <main className="mbody" id="main" style={{ gap: 20, paddingBottom: 16 }}>
        <div
          className="row"
          style={{ gap: 8, overflowX: 'auto', flexWrap: 'nowrap' }}
          tabIndex={0}
          aria-label="Analysis details"
        >
          {chips}
        </div>
        <h1 className="t24">
          <TokenText text={summary.headline} />
        </h1>
        <RevealBanner />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {summary.keyMetrics.slice(0, 4).map((m) => (
            <div
              key={m.label}
              className="card"
              style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              <span className="t12 sec">{m.label}</span>
              <span className="mono w6" style={{ fontSize: 18, lineHeight: '24px' }}>
                <TokenText text={m.value} />
              </span>
            </div>
          ))}
        </div>
        <section className="card pad16 col" aria-labelledby="mc" style={{ gap: 12 }}>
          <h2 id="mc" className="t14 w6">
            Anomalies by severity
          </h2>
          <div className="col" style={{ gap: 8 }}>
            {(['HIGH', 'MEDIUM', 'LOW'] as const).map((s) => (
              <div key={s} className="hbar" style={{ gridTemplateColumns: '88px 1fr 24px' }}>
                <SeverityBadge severity={s} />
                <span className="tr" aria-hidden="true">
                  <i
                    style={{
                      width: `${total ? Math.round((counts[s] / Math.max(1, ...Object.values(counts))) * 100) : 0}%`,
                      background:
                        s === 'HIGH'
                          ? 'var(--sev-high-fg)'
                          : s === 'MEDIUM'
                            ? 'var(--sev-med-fg)'
                            : 'var(--chart-3)',
                    }}
                  />
                </span>
                <span className="mono" style={{ textAlign: 'right' }}>
                  {counts[s]}
                </span>
              </div>
            ))}
          </div>
          <ButtonLink to={`/analyses/${analysis.id}/charts`} variant="ghost" size="sm" className="self-start">
            All charts
          </ButtonLink>
        </section>
        <Sections sections={sections} isUnverified={isUnverified} compact />
        {unverifiedBanner}
        <ButtonLink to={`/analyses/${analysis.id}/anomalies`} variant="primary" style={{ width: '100%' }}>
          View all {formatNumber(total)} anomalies
        </ButtonLink>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <ExportMenu analysisId={analysis.id} mobile />
          <ButtonLink to={`/files/${analysis.fileId}?analyze=1`}>Run again</ButtonLink>
        </div>
      </main>
    );
  }

  return (
    <main className="content" id="main">
      <header className="col" style={{ gap: 16 }}>
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            {chips}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <ButtonLink to={`/files/${analysis.fileId}?analyze=1`}>
              <Icon name="refresh" />
              Run again
            </ButtonLink>
            <ExportMenu analysisId={analysis.id} />
          </div>
        </div>
        <span className="sr-only">Analysis of {fileName}</span>
        <h1 className="t32" style={{ maxWidth: 920 }}>
          <TokenText text={summary.headline} />
        </h1>
      </header>
      <RevealBanner />
      {unverifiedBanner}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(176px, 100%), 1fr))',
          gap: 16,
        }}
      >
        {summary.keyMetrics.map((m) => (
          <div key={m.label} className="card stat" style={{ padding: '16px 20px' }}>
            <span className="t12 sec">{m.label}</span>
            <span className="v" style={{ fontSize: 22, lineHeight: '28px' }}>
              <TokenText text={m.value} />
            </span>
          </div>
        ))}
      </div>
      <div className="grid-3">
        <ChartTile title="Anomalies by severity" loading={charts.isPending}>
          {severity ? (
            <ChartBody model={chartModel(severity)!} title="Anomalies by severity" height={120} compact />
          ) : (
            <NoData />
          )}
        </ChartTile>
        <ChartTile title="Anomalies by type" loading={charts.isPending}>
          {byType ? <ChartBody model={chartModel(byType)!} title="Anomalies by type" compact /> : <NoData />}
        </ChartTile>
        <ChartTile
          title={activity?.title ?? 'Activity'}
          loading={charts.isPending}
          bucket={activity?.meta?.bucket}
        >
          {activity ? (
            <ChartBody model={chartModel(activity)!} title={activity.title} height={150} compact />
          ) : (
            <NoData />
          )}
        </ChartTile>
      </div>
      {charts.isSuccess && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: -8 }}>
          <ButtonLink to={`/analyses/${analysis.id}/charts`} variant="ghost">
            Show all charts ({chartSpecs.length})
          </ButtonLink>
        </div>
      )}
      <Sections sections={sections} isUnverified={isUnverified} />
      <div className="row wrap" style={{ gap: 8 }}>
        <ButtonLink to={`/analyses/${analysis.id}/anomalies`} variant="primary">
          View all anomalies
        </ButtonLink>
        <ButtonLink to={`/analyses/${analysis.id}/charts`}>View all charts</ButtonLink>
      </div>
    </main>
  );
}

const NoData = () => <span className="t12 muted">Not enough data for this chart.</span>;

function ChartTile({
  title,
  loading,
  bucket,
  children,
}: {
  title: string;
  loading: boolean;
  bucket?: string;
  children: ReactNode;
}) {
  return (
    <section className="card pad chart" aria-label={title}>
      <div className="row between">
        <h2 className="t14 w6">{title}</h2>
        {bucket && <span className="t12 muted">per {bucket}</span>}
      </div>
      {loading ? <Skeleton height={120} /> : children}
    </section>
  );
}

/** Collapsible findings; the first section starts open, closed sections show their high-severity count. */
function Sections({
  sections,
  isUnverified,
  compact,
}: {
  sections: Section[];
  isUnverified: (t: string) => boolean;
  compact?: boolean;
}) {
  return (
    <Accordion.Root
      type="multiple"
      defaultValue={sections[0] ? [sections[0].key] : []}
      className="card"
      aria-label="Findings"
      asChild
    >
      <section>
        {sections.map((s) => {
          const high = s.items.filter((i) => i.severity === 'HIGH').length;
          return (
            <Accordion.Item key={s.key} value={s.key} className="acc">
              <Accordion.Header asChild>
                <h2 style={{ margin: 0 }}>
                  <Accordion.Trigger
                    className="acch group"
                    style={compact ? { padding: '12px 16px' } : undefined}
                  >
                    <Icon
                      name="chevronRight"
                      className="transition-transform group-data-[state=open]:rotate-90"
                    />
                    <span className="grow">{s.title}</span>
                    {high > 0 && (
                      <SeverityBadge
                        severity="HIGH"
                        className="group-data-[state=open]:hidden"
                      >{`${high} high`}</SeverityBadge>
                    )}
                    <span className="count">{s.items.length}</span>
                  </Accordion.Trigger>
                </h2>
              </Accordion.Header>
              <Accordion.Content className="accb" style={compact ? { padding: '0 16px 16px' } : undefined}>
                {s.items.map((item, i) =>
                  compact ? (
                    <div key={i} className="col" style={{ gap: 6 }}>
                      {item.severity && <SeverityBadge severity={item.severity} className="self-start" />}
                      <p style={{ lineHeight: '26px' }}>
                        {item.prefix}
                        <TokenText text={item.text} />
                        {isUnverified(item.text) && <UnverifiedTag />}
                      </p>
                    </div>
                  ) : (
                    <div key={i} className="li">
                      <span className="n">{i + 1}</span>
                      <p className="grow" style={{ lineHeight: '26px' }}>
                        {item.prefix}
                        <TokenText text={item.text} />
                        {isUnverified(item.text) && <UnverifiedTag />}
                      </p>
                      {item.severity && <SeverityBadge severity={item.severity} />}
                    </div>
                  ),
                )}
              </Accordion.Content>
            </Accordion.Item>
          );
        })}
      </section>
    </Accordion.Root>
  );
}

const UnverifiedTag = () => (
  <span
    className="tag"
    style={{
      marginLeft: 8,
      color: 'var(--sev-med-fg)',
      borderColor: 'var(--sev-med-border)',
      background: 'var(--sev-med-bg)',
    }}
  >
    unverified
  </span>
);
