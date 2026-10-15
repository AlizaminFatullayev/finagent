import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { useParams } from 'react-router';
import type { ChartSpec } from '../../api/types';
import { usePageHeader } from '../../app/pageHeader';
import { ErrorState } from '../../components/ErrorState';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ChartCard } from '../../components/ui/ChartCard';
import { Icon } from '../../components/ui/Icon';
import { FilterSelect } from '../../components/ui/Overlays';
import { Card, EmptyState } from '../../components/ui/Surfaces';
import { useFile } from '../files/queries';
import { RevealProvider } from '../reveal/RevealProvider';
import { RevealBanner } from '../reveal/Token';
import { ChartBody } from './ChartBody';
import { chartModel, type ChartModel } from './model';
import { useAnalysis, useCharts } from './queries';

/** Charts gallery (Charts.html) with full screen (ChartsFullscreen.html). */
export function ChartsPage() {
  const { analysisId = '' } = useParams();
  const analysis = useAnalysis(analysisId);
  const completed = analysis.data?.status === 'COMPLETED';
  const charts = useCharts(analysisId, completed);
  const file = useFile(analysis.data?.fileId ?? '', Boolean(analysis.data));
  const [sheet, setSheet] = useState('all');
  const [full, setFull] = useState<{ spec: ChartSpec; model: ChartModel } | null>(null);
  usePageHeader([
    { label: `${file.data?.originalName ?? 'File'} / Result`, to: `/analyses/${analysisId}` },
    { label: 'Charts' },
  ]);

  const error = analysis.error ?? charts.error;
  if (error) {
    return (
      <main className="content" id="main">
        <ErrorState error={error} onRetry={() => void (analysis.refetch(), charts.refetch())} />
      </main>
    );
  }

  const models = (charts.data?.charts ?? [])
    .filter((c) => sheet === 'all' || c.sheetId === sheet)
    .map((spec) => ({ spec, model: chartModel(spec) }))
    .filter((x): x is { spec: ChartSpec; model: ChartModel } => x.model !== null);
  const sheets = file.data?.sheets ?? [];

  return (
    <RevealProvider fileId={analysis.data?.fileId ?? ''} key={analysisId}>
      <main className="content" id="main">
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="col" style={{ gap: 4 }}>
            <h1 className="t24">Charts</h1>
            <p className="sec">
              {charts.data
                ? `${models.length} charts computed for this analysis.`
                : 'Charts computed for this analysis.'}{' '}
              Values come from the computed statistics, not from the AI summary.
            </p>
          </div>
          <ButtonLink to={`/analyses/${analysisId}`}>
            <Icon name="chevronLeft" />
            Back to result
          </ButtonLink>
        </div>
        {sheets.length > 1 && (
          <div className="row">
            <FilterSelect
              label="Sheet"
              value={sheet}
              onChange={setSheet}
              options={[
                { value: 'all', label: 'All' },
                ...sheets.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
        )}
        <RevealBanner />
        <div className="grid-2">
          {charts.isPending || !completed
            ? [1, 2, 3, 4].map((i) => <ChartCard key={i} title="Loading chart" loading />)
            : models.map(({ spec, model }) => (
                <ChartCard
                  key={spec.id}
                  group={
                    sheets.length > 1
                      ? `${model.group} · ${sheets.find((x) => x.id === spec.sheetId)?.name ?? ''}`
                      : model.group
                  }
                  title={spec.title}
                  bucket={model.bucket}
                  note={model.notes.length ? model.notes.join(' ') : undefined}
                  onExpand={() => setFull({ spec, model })}
                >
                  <ChartBody model={model} title={spec.title} />
                </ChartCard>
              ))}
        </div>
        {charts.isSuccess && models.length === 0 && (
          <Card>
            <EmptyState
              icon="chart"
              title="Not enough data for charts"
              action={<ButtonLink to={`/files/${analysis.data?.fileId}`}>Check the schema</ButtonLink>}
            >
              The file has no date, numeric or low-cardinality columns that can be charted.
            </EmptyState>
          </Card>
        )}
        <Dialog.Root open={full !== null} onOpenChange={(o) => !o && setFull(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="overlay" style={{ placeItems: 'stretch', padding: 40 }}>
              <Dialog.Content
                className="dialog"
                style={{ maxWidth: 'none', height: '100%' }}
                aria-describedby={undefined}
              >
                {full && (
                  <>
                    <div
                      className="row between"
                      style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <div className="col" style={{ gap: 2 }}>
                        <span className="over">{full.model.group}</span>
                        <Dialog.Title className="t20">{full.spec.title}</Dialog.Title>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        {full.model.bucket && <span className="tag">{full.model.bucket}</span>}
                        <Dialog.Close asChild>
                          <Button variant="ghost" icon aria-label="Exit full screen">
                            <Icon name="x" size={20} />
                          </Button>
                        </Dialog.Close>
                      </div>
                    </div>
                    <div
                      style={{
                        flex: '1 1 0%',
                        padding: 32,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        overflow: 'auto',
                      }}
                    >
                      <ChartBody model={full.model} title={full.spec.title} height={420} />
                      {full.model.notes.length > 0 && (
                        <span className="t12 muted">{full.model.notes.join(' ')}</span>
                      )}
                    </div>
                  </>
                )}
              </Dialog.Content>
            </Dialog.Overlay>
          </Dialog.Portal>
        </Dialog.Root>
      </main>
    </RevealProvider>
  );
}
