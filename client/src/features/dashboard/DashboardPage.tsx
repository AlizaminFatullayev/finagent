import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, unwrap, unwrapBody } from '../../api/client';
import type { Analysis, FileItem } from '../../api/types';
import { usePageHeader } from '../../app/pageHeader';
import { canSeeAllFiles, useUser } from '../../auth/AuthProvider';
import { StatusBadge, SeverityBadge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { limitsText } from '../../components/ui/Dropzone';
import { Icon } from '../../components/ui/Icon';
import {
  Banner,
  Card,
  EmptyState,
  ProgressBar,
  Skeleton,
  StatCard,
  StatSkeleton,
} from '../../components/ui/Surfaces';
import { TokenChip } from '../../components/ui/TokenChip';
import { formatBytes, formatNumber, formatShortDateTime, formatWhen } from '../../lib/format';
import { splitTokens } from '../../lib/tokens';
import { useLiveProgress } from '../../realtime/progress';

const DAY = 86_400_000;
const FILE_SAMPLE = 100;
const ANALYSIS_SAMPLE = 10;

const STAGE: Record<string, string> = {
  parsing: 'Parsing',
  analyzing: 'Analyzing',
  summarizing: 'Summarizing',
  done: 'Done',
};

/**
 * Dashboard (Dashboard.html). The API has no aggregate endpoint (docs/API_GAPS.md, gap 1), so the
 * numbers are derived from the newest 100 files and the analyses of the 10 newest ready files; the
 * context lines say so when a number is a lower bound.
 */
export function DashboardPage() {
  const me = useUser();
  usePageHeader([{ label: 'Dashboard' }]);
  const live = useLiveProgress();

  const files = useQuery({
    queryKey: ['dashboard', 'files'],
    queryFn: () => unwrapBody(api.GET('/api/files', { params: { query: { limit: FILE_SAMPLE } } })),
  });
  const list = files.data?.data ?? [];
  const ready = list.filter((f) => f.status === 'READY').slice(0, ANALYSIS_SAMPLE);
  const analyses = useQuery({
    queryKey: ['dashboard', 'analyses', ready.map((f) => f.id)],
    enabled: files.isSuccess,
    queryFn: async () => {
      const lists = await Promise.all(
        ready.map((f) =>
          unwrap(
            api.GET('/api/files/{id}/analyses', { params: { path: { id: f.id }, query: { limit: 20 } } }),
          ).then((a) => a.map((x) => ({ ...x, fileName: f.originalName }))),
        ),
      );
      return lists.flat();
    },
  });

  // Windows are measured from when the list was fetched, which keeps rendering pure.
  const now = files.dataUpdatedAt;
  const within = (iso: string, days: number) => now - Date.parse(iso) < days * DAY;
  const more = files.data?.meta.nextCursor != null;
  const files30 = list.filter((f) => within(f.createdAt, 30)).length;
  const files7 = list.filter((f) => within(f.createdAt, 7)).length;
  const all = (analyses.data ?? []) as (Analysis & { fileName: string })[];
  const runs30 = all.filter((a) => within(a.createdAt, 30));
  // Anomalies: latest completed analysis per file, so re-runs are not double-counted.
  const latest = new Map<string, Analysis & { fileName: string }>();
  for (const a of all) if (a.status === 'COMPLETED' && !latest.has(a.fileId)) latest.set(a.fileId, a);
  const completed = [...latest.values()].filter((a) => within(a.createdAt, 30));
  const anomalies = completed.reduce((n, a) => n + (a.result?.anomalies.length ?? 0), 0);
  const high = completed.reduce((n, a) => n + (a.result?.severityCounts.HIGH ?? 0), 0);
  const processing = list.filter((f) => f.status === 'PROCESSING' || f.status === 'UPLOADED');
  const recentAnalyses = all
    .filter((a) => a.status === 'COMPLETED')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);

  const jobs = [
    ...processing.map((f) => ({
      id: f.id,
      name: f.originalName,
      percent: live.files[f.id]?.percent ?? 0,
      stage: f.status === 'UPLOADED' ? 'Queued for parsing' : 'Parsing',
      to: `/files/${f.id}`,
    })),
    ...Object.values(live.analyses)
      .filter((p) => p.stage !== 'done')
      .map((p) => ({
        id: p.analysisId,
        name: list.find((f) => f.id === p.fileId)?.originalName ?? 'Analysis',
        percent: p.percent,
        stage: `${STAGE[p.stage] ?? p.stage} · analysis`,
        to: `/analyses/${p.analysisId}`,
      })),
  ];

  const empty = files.isSuccess && list.length === 0;
  const subtitle = empty
    ? 'Welcome to FinAgent.'
    : canSeeAllFiles(me.role)
      ? 'Your team’s files and analyses, last 30 days.'
      : 'Your files and analyses, last 30 days.';

  return (
    <main className="content" id="main">
      <div className="row between wrap" style={{ gap: 16 }}>
        <div className="col" style={{ gap: 4 }}>
          <h1 className="t24">Dashboard</h1>
          <p className="sec">{subtitle}</p>
        </div>
        <ButtonLink to="/upload" variant="primary">
          <Icon name="upload" />
          Upload file
        </ButtonLink>
      </div>

      {files.isError && (
        <Banner
          kind="error"
          role="alert"
          title="Couldn’t load your files"
          action={
            <Button size="sm" onClick={() => void files.refetch()}>
              Retry
            </Button>
          }
        >
          The rest of the page still works.
        </Banner>
      )}

      {empty ? (
        <Card>
          <div className="empty" style={{ padding: '96px 24px' }}>
            <div className="ei">
              <Icon name="upload" size={20} />
            </div>
            <h2 className="t20">Upload your first file</h2>
            <p className="sec" style={{ maxWidth: 440 }}>
              FinAgent reads .xlsx and .csv files, masks sensitive values, finds anomalies and writes a
              summary you can export.
            </p>
            <ButtonLink to="/upload" variant="primary" size="lg">
              Upload your first file
            </ButtonLink>
            <span className="t12 muted">{limitsText}</span>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid-auto">
            {files.isPending ? (
              [1, 2, 3, 4].map((i) => <StatSkeleton key={i} />)
            ) : (
              <>
                <StatCard
                  label="Files uploaded"
                  value={`${formatNumber(files30)}${more && files30 === list.length ? '+' : ''}`}
                  context={`+${formatNumber(files7)} this week`}
                />
                <StatCard
                  label="Analyses run"
                  value={analyses.isPending ? '…' : formatNumber(runs30.length)}
                  context={`On your ${ready.length} newest ready files`}
                />
                <StatCard
                  label="Anomalies found"
                  value={analyses.isPending ? '…' : formatNumber(anomalies)}
                  context={`${formatNumber(high)} high severity · latest results`}
                />
                <StatCard
                  label="Files processing now"
                  value={formatNumber(processing.length)}
                  context="Updates live"
                />
              </>
            )}
          </div>

          {jobs.length > 0 && (
            <section className="card" aria-labelledby="ip">
              <div className="cardhead">
                <h2 id="ip" className="t16 w6 row">
                  <span className="pulse" />
                  In progress
                </h2>
                <span className="t12 muted">Live</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
                }}
              >
                {jobs.map((j) => (
                  <Link
                    key={j.id}
                    to={j.to}
                    style={{
                      padding: '16px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      borderRight: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div className="row between">
                      <span className="w5 ellipsis">{j.name}</span>
                      <span className="mono muted">{Math.round(j.percent)}%</span>
                    </div>
                    <ProgressBar percent={j.percent} label={`${j.name} progress`} />
                    <span className="t12 sec">{j.stage}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="grid-2">
            <section className="card" aria-labelledby="rf">
              <div className="cardhead">
                <h2 id="rf" className="t16 w6">
                  Recent files
                </h2>
                <Link to="/files" className="t14 w5">
                  View all
                </Link>
              </div>
              {files.isPending
                ? [1, 2, 3, 4].map((i) => <RowSkeleton key={i} />)
                : list.slice(0, 5).map((f) => <RecentFile key={f.id} file={f} />)}
            </section>
            <section className="card" aria-labelledby="ra">
              <div className="cardhead">
                <h2 id="ra" className="t16 w6">
                  Recent analyses
                </h2>
              </div>
              {analyses.isError && (
                <div style={{ padding: 16 }}>
                  <Banner
                    kind="error"
                    title="Couldn’t load recent analyses"
                    action={
                      <Button size="sm" onClick={() => void analyses.refetch()}>
                        Retry
                      </Button>
                    }
                  >
                    The rest of the page still works.
                  </Banner>
                </div>
              )}
              {(files.isPending || analyses.isPending) &&
                !analyses.isError &&
                [1, 2, 3].map((i) => <RowSkeleton key={i} />)}
              {analyses.isSuccess && recentAnalyses.length === 0 && (
                <EmptyState icon="chart" title="No analyses yet">
                  Open a ready file and choose Analyze to get statistics, anomalies and a summary.
                </EmptyState>
              )}
              {recentAnalyses.map((a) => (
                <Link
                  key={a.id}
                  to={`/analyses/${a.id}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '14px 24px',
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span className="row between">
                    <span className="t12 muted ellipsis">{a.fileName}</span>
                    <span className="t12 muted mono" title={formatShortDateTime(a.createdAt)}>
                      {formatWhen(a.createdAt)}
                    </span>
                  </span>
                  <span
                    className="w5"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Inside a link, tokens are plain labels; reveal from the result page. */}
                    {splitTokens(a.result?.summary.headline ?? '').map((s, i) =>
                      'token' in s ? <TokenChip key={i} token={s.token} /> : <span key={i}>{s.text}</span>,
                    )}
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="t12 sec">
                      <span className="mono">{formatNumber(a.result?.anomalies.length ?? 0)}</span> anomalies
                    </span>
                    {(a.result?.severityCounts.HIGH ?? 0) > 0 && (
                      <SeverityBadge severity="HIGH">{a.result?.severityCounts.HIGH} high</SeverityBadge>
                    )}
                  </span>
                </Link>
              ))}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function RecentFile({ file }: { file: FileItem }) {
  return (
    <Link
      to={`/files/${file.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 24px',
        borderBottom: '1px solid var(--border-subtle)',
        color: 'var(--text-primary)',
        minHeight: 56,
      }}
    >
      <Icon name="file" size={20} className="muted" />
      <span className="col grow">
        <span className="w5 ellipsis">{file.originalName}</span>
        <span className="t12 muted">
          {formatBytes(file.sizeBytes)} · {formatShortDateTime(file.createdAt)}
        </span>
      </span>
      <StatusBadge status={file.status} />
    </Link>
  );
}

const RowSkeleton = () => (
  <div
    className="row"
    style={{ gap: 12, padding: '14px 24px', borderBottom: '1px solid var(--border-subtle)' }}
    aria-hidden="true"
  >
    <Skeleton width={20} height={20} />
    <div className="col grow" style={{ gap: 6 }}>
      <Skeleton height={12} width="60%" />
      <Skeleton height={10} width="40%" />
    </div>
    <Skeleton width={72} height={22} radius={11} />
  </div>
);
