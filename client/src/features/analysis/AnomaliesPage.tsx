import { useInfiniteQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useParams } from 'react-router';
import { api, unwrapBody } from '../../api/client';
import type { Anomaly, FileDetail, Severity } from '../../api/types';
import { usePageHeader } from '../../app/pageHeader';
import { ErrorState } from '../../components/ErrorState';
import { SeverityBadge, severityLabel, Tag } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Drawer, FilterSelect } from '../../components/ui/Overlays';
import { Card, EmptyState, Skeleton } from '../../components/ui/Surfaces';
import { HiddenHeader, Table } from '../../components/ui/Table';
import { formatDateTime, formatNumber } from '../../lib/format';
import { CellValue, isNumeric } from '../files/cells';
import { useFile } from '../files/queries';
import { RevealProvider } from '../reveal/RevealProvider';
import { RevealBanner, RevealSelection, TokenText } from '../reveal/Token';
import { useAnalysis } from './queries';

const CHUNK = 10;
const SEVERITIES: Severity[] = ['HIGH', 'MEDIUM', 'LOW'];
const HINT: Record<Severity, string> = {
  HIGH: 'Review first',
  MEDIUM: 'Review this week',
  LOW: 'Informational',
};

/** Anomalies (Anomalies.html, Empty, Drawer). All anomalies come with the result; filters run locally. */
export function AnomaliesPage() {
  const { analysisId = '' } = useParams();
  const analysis = useAnalysis(analysisId);
  const file = useFile(analysis.data?.fileId ?? '', Boolean(analysis.data));
  const name = file.data?.originalName ?? 'File';
  usePageHeader([{ label: `${name} / Result`, to: `/analyses/${analysisId}` }, { label: 'Anomalies' }]);
  if (analysis.isError) {
    return (
      <main className="content" id="main">
        <ErrorState error={analysis.error} onRetry={() => void analysis.refetch()} />
      </main>
    );
  }
  if (!analysis.data || !file.data) {
    return (
      <main className="content" id="main" aria-busy="true">
        <Skeleton height={32} width="30%" />
        <Card className="pad col" style={{ gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={14} />
          ))}
        </Card>
      </main>
    );
  }
  return (
    <RevealProvider fileId={file.data.id} key={analysisId}>
      <Anomalies
        anomalies={analysis.data.result?.anomalies ?? []}
        file={file.data}
        analysisId={analysisId}
        when={analysis.data.createdAt}
        checks={analysis.data.result?.methodology ?? []}
      />
    </RevealProvider>
  );
}

function Anomalies({
  anomalies,
  file,
  analysisId,
  when,
  checks,
}: {
  anomalies: Anomaly[];
  file: FileDetail;
  analysisId: string;
  when: string;
  checks: { ruleId: string; description: string }[];
}) {
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [type, setType] = useState('all');
  const [column, setColumn] = useState('all');
  const [open, setOpen] = useState<string | null>(anomalies[0]?.id ?? null);
  const [shown, setShown] = useState(CHUNK);
  const [drawer, setDrawer] = useState<Anomaly | null>(null);
  const method = new Map(checks.map((c) => [c.ruleId, c.description]));
  const counts = Object.fromEntries(
    SEVERITIES.map((s) => [s, anomalies.filter((a) => a.severity === s).length]),
  ) as Record<Severity, number>;
  const types = [...new Set(anomalies.map((a) => a.type))].sort();
  const columns = [...new Set(anomalies.flatMap((a) => (a.column ? [a.column] : [])))].sort();
  const filtered = anomalies.filter(
    (a) =>
      (severity === 'all' || a.severity === severity) &&
      (type === 'all' || a.type === type) &&
      (column === 'all' || a.column === column),
  );
  const rows = file.sheets.reduce((n, s) => n + s.rowCount, 0);

  const header = (
    <div className="row between wrap" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 4 }}>
        <h1 className="t24">Anomalies</h1>
        <p className="sec">
          {file.originalName} · analysis of {formatDateTime(when)}
        </p>
      </div>
      <ButtonLink to={`/analyses/${analysisId}`}>
        <Icon name="chevronLeft" />
        Back to result
      </ButtonLink>
    </div>
  );

  if (anomalies.length === 0) {
    return (
      <main className="content" id="main">
        {header}
        <Card>
          <EmptyState
            icon="check"
            tone="success"
            large
            title="No anomalies detected"
            action={<ButtonLink to={`/analyses/${analysisId}`}>Back to result</ButtonLink>}
          >
            All {checks.length} checks ran on {formatNumber(rows)} rows and found nothing unusual. The
            statistics and summary are still available.
          </EmptyState>
        </Card>
      </main>
    );
  }

  return (
    <main className="content" id="main">
      {header}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
          gap: 16,
        }}
      >
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            className="card stat focusable"
            aria-pressed={severity === s}
            onClick={() => {
              setSeverity(severity === s ? 'all' : s);
              setShown(CHUNK);
            }}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              font: 'inherit',
              color: 'inherit',
              borderColor:
                s === 'HIGH' && counts.HIGH > 0
                  ? 'var(--sev-high-border)'
                  : severity === s
                    ? 'var(--accent)'
                    : undefined,
            }}
          >
            <SeverityBadge severity={s} className="self-start" />
            <span className="v">{formatNumber(counts[s])}</span>
            <span className="t12 muted">{HINT[s]}</span>
          </button>
        ))}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <FilterSelect
          label="Severity"
          value={severity}
          onChange={(v) => (setSeverity(v), setShown(CHUNK))}
          options={[
            { value: 'all', label: 'All' },
            ...SEVERITIES.map((s) => ({ value: s, label: severityLabel(s) })),
          ]}
        />
        <FilterSelect
          label="Type"
          value={type}
          onChange={(v) => (setType(v), setShown(CHUNK))}
          options={[{ value: 'all', label: 'All' }, ...types.map((t) => ({ value: t, label: t }))]}
        />
        {columns.length > 0 && (
          <FilterSelect
            label="Column"
            value={column}
            onChange={(v) => (setColumn(v), setShown(CHUNK))}
            options={[{ value: 'all', label: 'All' }, ...columns.map((c) => ({ value: c, label: c }))]}
          />
        )}
        <span className="t12 muted" style={{ marginLeft: 'auto' }} aria-live="polite">
          Showing {Math.min(shown, filtered.length)} of {filtered.length}
        </span>
      </div>
      <RevealBanner />
      <div className="card" style={{ overflow: 'hidden' }}>
        <Table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <HiddenHeader>Expand</HiddenHeader>
              </th>
              <th>Type</th>
              <th>Severity</th>
              <th style={{ textAlign: 'right' }}>Affected rows</th>
              <th>Description</th>
              <th>Columns</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, shown).map((a) => {
              const isOpen = open === a.id;
              return (
                <Fragment key={a.id}>
                  <tr className={isOpen ? 'open' : undefined}>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        aria-expanded={isOpen}
                        aria-controls={`details-${a.id}`}
                        aria-label={`Show details for ${a.type}`}
                        onClick={() => setOpen(isOpen ? null : a.id)}
                      >
                        <Icon
                          name="chevronRight"
                          style={{ transform: isOpen ? 'rotate(90deg)' : undefined }}
                        />
                      </Button>
                    </td>
                    <td className="w5">{a.type}</td>
                    <td>
                      <SeverityBadge severity={a.severity} />
                    </td>
                    <td className="num">{formatNumber(a.affectedCount)}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 280 }}>
                      <TokenText text={a.description} />
                    </td>
                    <td>
                      <span className="row" style={{ gap: 4 }}>
                        {a.column && <Tag>{a.column}</Tag>}
                        <span className="t12 muted">{a.sheet}</span>
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="open" id={`details-${a.id}`}>
                      <td />
                      <td colSpan={5} style={{ whiteSpace: 'normal', padding: '8px 16px 20px' }}>
                        <div className="col" style={{ gap: 16 }}>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                              gap: 8,
                            }}
                          >
                            {Object.entries(a.metrics).map(([k, v]) => (
                              <div
                                key={k}
                                className="col"
                                style={{
                                  gap: 2,
                                  padding: 12,
                                  background: 'var(--surface-primary)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 6,
                                }}
                              >
                                <span className="t12 muted">{metricLabel(k)}</span>
                                <span className="mono w5" style={{ overflowWrap: 'anywhere' }}>
                                  {typeof v === 'number' ? formatMetric(v) : <TokenText text={v} />}
                                </span>
                              </div>
                            ))}
                          </div>
                          {method.get(a.ruleId) && (
                            <span className="t12 muted">Method: {method.get(a.ruleId)}</span>
                          )}
                          {a.rowIndexes.length > 0 && (
                            <div>
                              <Button size="sm" variant="primary" onClick={() => setDrawer(a)}>
                                View affected rows ({formatNumber(a.affectedCount)})
                              </Button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
        {filtered.length === 0 && (
          <EmptyState
            icon="search"
            title="No anomalies match"
            action={
              <Button onClick={() => (setSeverity('all'), setType('all'), setColumn('all'))}>
                Clear filters
              </Button>
            }
          />
        )}
        {shown < filtered.length && (
          <div className="loadmore">
            <Button onClick={() => setShown(shown + CHUNK)}>Load more</Button>
          </div>
        )}
      </div>
      <AffectedRows anomaly={drawer} file={file} onClose={() => setDrawer(null)} />
    </main>
  );
}

/** "rowsInWindow" -> "Rows in window". */
const metricLabel = (key: string) => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const formatMetric = (v: number) =>
  Number.isInteger(v) ? formatNumber(v) : v.toLocaleString('en-US', { maximumFractionDigits: 4 });

/**
 * Rows flagged by one anomaly (AnomaliesDrawer.html). The API has no rows-by-index endpoint
 * (API_GAPS gap 7), so each row is read with `cursor = rowIndex - 1, limit = 1`, ten at a time.
 */
function AffectedRows({
  anomaly,
  file,
  onClose,
}: {
  anomaly: Anomaly | null;
  file: FileDetail;
  onClose: () => void;
}) {
  const sheet = file.sheets.find((s) => s.name === anomaly?.sheet) ?? file.sheets[0];
  const indexes = anomaly?.rowIndexes ?? [];
  const pages = useInfiniteQuery({
    queryKey: ['affected', file.id, anomaly?.id],
    enabled: Boolean(anomaly && sheet),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const slice = indexes.slice(pageParam, pageParam + CHUNK);
      const found = await Promise.all(
        slice.map((rowIndex) =>
          unwrapBody(
            api.GET('/api/files/{id}/rows', {
              params: {
                path: { id: file.id },
                query: { sheetId: sheet!.id, cursor: rowIndex - 1, limit: 1 },
              },
            }),
          ).then((r) => r.data.find((row) => row.rowIndex === rowIndex)),
        ),
      );
      return found.filter((r) => r !== undefined);
    },
    getNextPageParam: (_last, all) => (all.length * CHUNK < indexes.length ? all.length * CHUNK : undefined),
  });
  const rows = pages.data?.pages.flat() ?? [];
  const cols = sheet?.columns ?? [];
  return (
    <Drawer
      open={anomaly !== null}
      onOpenChange={(o) => !o && onClose()}
      width={760}
      title="Affected rows"
      badge={anomaly && <SeverityBadge severity={anomaly.severity} />}
      subtitle={
        anomaly && `${anomaly.type} · ${formatNumber(anomaly.affectedCount)} rows · sheet ${anomaly.sheet}`
      }
      footer={
        <div
          className="row between"
          style={{ padding: '12px 24px', borderTop: '1px solid var(--border-subtle)' }}
        >
          <span className="t12 muted mono">
            {rows.length} of {formatNumber(anomaly?.affectedCount ?? 0)}
            {indexes.length < (anomaly?.affectedCount ?? 0) && ` · first ${indexes.length} referenced`}
          </span>
          {pages.hasNextPage && (
            <Button size="sm" loading={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
              Load more
            </Button>
          )}
        </div>
      }
    >
      <div
        className="row between wrap"
        style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', gap: 8 }}
      >
        <span className="t12 sec">Filtered to rows flagged by this finding</span>
        <RevealSelection />
      </div>
      <RevealBanner style={{ margin: '12px 24px 0' }} />
      <div className="tblwrap" style={{ flex: '1 1 0%', overflow: 'auto' }}>
        {pages.isError ? (
          <div style={{ padding: 24 }}>
            <ErrorState error={pages.error} onRetry={() => void pages.refetch()} />
          </div>
        ) : (
          <table className="tbl dense">
            <thead>
              <tr>
                {cols.map((c, i) => (
                  <th
                    key={c.key}
                    className={i === 0 ? 'sticky' : undefined}
                    style={isNumeric(c) ? { textAlign: 'right' } : undefined}
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pages.isPending &&
                [1, 2, 3].map((i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c.key}>
                        <Skeleton height={14} width={72} />
                      </td>
                    ))}
                  </tr>
                ))}
              {rows.map((r) => (
                <tr key={r.rowIndex}>
                  {cols.map((c, i) => (
                    <td
                      key={c.key}
                      className={
                        [
                          i === 0 && 'sticky',
                          isNumeric(c) && 'num',
                          c.type === 'date' && 'mono',
                          c.type === 'id' && 'mono sec',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    >
                      <CellValue value={r.data[c.key]} column={c} selectable />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Drawer>
  );
}
