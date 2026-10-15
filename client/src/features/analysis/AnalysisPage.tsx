import { useMutation } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router';
import { api, unwrap } from '../../api/client';
import type { Analysis } from '../../api/types';
import { usePageHeader } from '../../app/pageHeader';
import { ErrorState } from '../../components/ErrorState';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Stepper } from '../../components/ui/Stepper';
import { Banner, Skeleton } from '../../components/ui/Surfaces';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatDateTime } from '../../lib/format';
import { useLiveProgress } from '../../realtime/progress';
import { useFile } from '../files/queries';
import { failureInfo, STAGE_DETAIL, stepsFor } from './model';
import { useAnalysis } from './queries';
import { ResultView } from './ResultView';

const LANGUAGE = { en: 'English', az: 'Azərbaycan' } as const;

/** /analyses/:id: progress while it runs, the failed state, or the result. */
export function AnalysisPage() {
  const { analysisId = '' } = useParams();
  const analysis = useAnalysis(analysisId);
  const file = useFile(analysis.data?.fileId ?? '', Boolean(analysis.data));
  const name = file.data?.originalName ?? 'File';
  const completed = analysis.data?.status === 'COMPLETED';
  usePageHeader([
    { label: name, to: analysis.data ? `/files/${analysis.data.fileId}` : undefined },
    { label: completed ? 'Analysis result' : 'Analysis' },
  ]);

  if (analysis.isPending) {
    return (
      <main className="content" id="main" aria-busy="true">
        <Skeleton height={28} width="30%" />
        <Skeleton height={40} width="80%" />
      </main>
    );
  }
  if (analysis.isError) {
    return (
      <main className="content" id="main">
        <ErrorState error={analysis.error} onRetry={() => void analysis.refetch()} />
      </main>
    );
  }
  const a = analysis.data;
  if (a.status === 'COMPLETED') return <ResultView analysis={a} fileName={name} />;
  return <Progress analysis={a} fileName={name} />;
}

function Progress({ analysis, fileName }: { analysis: Analysis; fileName: string }) {
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const live = useLiveProgress().analyses[analysis.id];
  const failed = analysis.status === 'FAILED';
  const info = failureInfo(analysis.error?.code);
  const stage = failed
    ? live?.stage && live.stage !== 'done'
      ? live.stage
      : info.stage
    : (live?.stage ?? (analysis.status === 'RUNNING' ? 'parsing' : null));
  const percent = live?.percent ?? 0;
  const steps = stepsFor(stage, percent, failed);
  const retry = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/files/{id}/analyses', {
          params: { path: { id: analysis.fileId } },
          body: { language: analysis.language, focusColumns: analysis.params.focusColumns },
        }),
      ),
    onSuccess: (next) => navigate(`/analyses/${next.id}`, { replace: true }),
  });

  const title = failed ? 'Analysis failed' : 'Analyzing your file';
  const sub = failed
    ? 'Your file is safe and still available.'
    : mobile
      ? 'Usually takes a few minutes.'
      : 'Usually takes a few minutes for a file this size.';
  const stageLabel = steps.find((s) => s.state === 'current' || s.state === 'failed')?.label;

  if (mobile) {
    return (
      <main className="mbody" id="main" style={{ gap: 24, paddingBottom: 16 }}>
        <div className="col" style={{ gap: 8 }}>
          <span className="over ellipsis">{fileName}</span>
          <h1 className="t24" aria-live="polite">
            {title}
          </h1>
          <p className="sec">{sub}</p>
        </div>
        <ol
          className="card"
          style={{ listStyle: 'none', margin: 0, padding: '8px 16px' }}
          aria-label="Progress"
        >
          {steps.map((s, i) => {
            const last = i === steps.length - 1;
            const border = last ? undefined : '1px solid var(--border-subtle)';
            if (s.state === 'current' || s.state === 'failed') {
              return (
                <li
                  key={s.label}
                  className="col"
                  aria-current="step"
                  style={{ gap: 8, padding: '12px 0', borderBottom: border }}
                >
                  <span className="row" style={{ gap: 12 }}>
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        border: `1.5px solid ${s.state === 'failed' ? 'var(--sev-high-fg)' : 'var(--accent)'}`,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      {s.state === 'failed' ? <Icon name="x" /> : <span className="pulse" />}
                    </span>
                    <span className="grow w5">{s.label}</span>
                    <span className="mono t12">{percent}%</span>
                  </span>
                  <div className="bar" style={{ marginLeft: 36 }}>
                    <i
                      style={{
                        width: `${s.fill}%`,
                        background: s.state === 'failed' ? 'var(--sev-high-fg)' : undefined,
                      }}
                    />
                  </div>
                  <span className="t12 muted" style={{ marginLeft: 36 }}>
                    {failed ? `Stopped at ${s.label}` : stage && STAGE_DETAIL[stage]}
                  </span>
                </li>
              );
            }
            return (
              <li key={s.label} className="row" style={{ gap: 12, minHeight: 56, borderBottom: border }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    ...(s.state === 'done'
                      ? { background: 'var(--accent)', color: 'var(--accent-contrast)' }
                      : { border: '1.5px solid var(--border-strong)' }),
                  }}
                >
                  {s.state === 'done' && <Icon name="check" />}
                </span>
                <span className={s.state === 'done' ? 'grow sec' : 'grow muted'}>{s.label}</span>
              </li>
            );
          })}
        </ol>
        {failed ? (
          <FailureBanner analysis={analysis} />
        ) : (
          <div className="row t12 muted" style={{ gap: 8, alignItems: 'flex-start' }}>
            <Icon name="bell" style={{ marginTop: 2 }} />
            You can leave this screen. We’ll notify you when it’s ready.
          </div>
        )}
        {failed && info.retry && (
          <Button
            variant="primary"
            loading={retry.isPending}
            onClick={() => retry.mutate()}
            style={{ width: '100%' }}
          >
            <Icon name="refresh" />
            Try again
          </Button>
        )}
        <ButtonLink to={`/files/${analysis.fileId}`} style={{ width: '100%' }}>
          Back to file
        </ButtonLink>
      </main>
    );
  }

  return (
    <main className="content" id="main" style={{ maxWidth: 760, paddingTop: 64 }}>
      <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div className="col" style={{ gap: 8 }}>
          <span className="over">
            {fileName} · {LANGUAGE[analysis.language]}
          </span>
          <h1 className="t24" aria-live="polite">
            {title}
          </h1>
          <p className="sec">{sub}</p>
        </div>
        <Stepper steps={steps} />
        <div className="row between t12 sec" aria-live="polite">
          <span>
            {failed ? `Stopped at ${stageLabel}` : stage ? STAGE_DETAIL[stage] : 'Waiting for a worker'}
          </span>
          <span className="mono">{percent}%</span>
        </div>
        {failed ? (
          <>
            <FailureBanner analysis={analysis} />
            {retry.isError && (
              <Banner kind="error" title="The analysis didn’t restart">
                Try again in a moment.
              </Banner>
            )}
            <div className="row" style={{ gap: 8 }}>
              {info.retry && (
                <Button variant="primary" loading={retry.isPending} onClick={() => retry.mutate()}>
                  <Icon name="refresh" />
                  Try again
                </Button>
              )}
              <ButtonLink to={`/files/${analysis.fileId}`}>Back to file</ButtonLink>
            </div>
          </>
        ) : (
          <div className="row t12 muted" style={{ gap: 8 }}>
            <Icon name="bell" />
            You can leave this page. We’ll notify you when the result is ready.
          </div>
        )}
      </div>
    </main>
  );
}

function FailureBanner({ analysis }: { analysis: Analysis }) {
  const info = failureInfo(analysis.error?.code);
  return (
    <div className="banner error" role="alert">
      <Icon name="alert" className="ic" />
      <div className="col" style={{ gap: 4 }}>
        <span className="w5">{info.title}</span>
        <span className="t12 sec">{info.body}</span>
        <span className="t12 muted mono">
          Ref: {analysis.id.slice(0, 8)} · {analysis.error?.code ?? 'ANALYSIS_FAILED'} ·{' '}
          {formatDateTime(analysis.completedAt ?? analysis.createdAt)}
        </span>
      </div>
    </div>
  );
}
