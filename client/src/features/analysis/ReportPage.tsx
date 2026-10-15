import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { fetchBlob, saveBlob } from '../../api/download';
import { usePageHeader } from '../../app/pageHeader';
import { ErrorState } from '../../components/ErrorState';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Skeleton } from '../../components/ui/Surfaces';
import { formatBytes } from '../../lib/format';
import { useFile } from '../files/queries';
import { useAnalysis } from './queries';

/**
 * PDF report preview (ExportPdf.html). Shows the real server-generated PDF in the browser's viewer
 * through a temporary object URL (revoked on leave) rather than an HTML imitation of it.
 */
export function ReportPage() {
  const { analysisId = '' } = useParams();
  const analysis = useAnalysis(analysisId);
  const file = useFile(analysis.data?.fileId ?? '', Boolean(analysis.data));
  usePageHeader([
    { label: `${file.data?.originalName ?? 'File'} / Result`, to: `/analyses/${analysisId}` },
    { label: 'PDF report' },
  ]);
  const pdf = useQuery({
    queryKey: ['report-pdf', analysisId],
    gcTime: 0,
    staleTime: Infinity,
    enabled: analysis.data?.status === 'COMPLETED',
    queryFn: () =>
      fetchBlob(`/api/analyses/${analysisId}/export?format=pdf`, `finagent-report-${analysisId}.pdf`),
  });

  const error = analysis.error ?? pdf.error;
  return (
    <main className="content" id="main" style={{ maxWidth: 1200 }}>
      <div className="row between wrap" style={{ gap: 16 }}>
        <div className="col" style={{ gap: 4 }}>
          <h1 className="t24">PDF report</h1>
          <p className="sec">
            A4 portrait, always light regardless of the app theme. Masked tokens stay masked.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {pdf.data && (
            <span className="tag">{`${pdf.data.filename} · ${formatBytes(pdf.data.blob.size)}`}</span>
          )}
          <ButtonLink to={`/analyses/${analysisId}`}>
            <Icon name="chevronLeft" />
            Back to result
          </ButtonLink>
          {pdf.data && (
            <Button variant="primary" onClick={() => saveBlob(pdf.data.blob, pdf.data.filename)}>
              <Icon name="download" />
              Download
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={() => void pdf.refetch()} />
      ) : pdf.data ? (
        <PdfFrame blob={pdf.data.blob} />
      ) : (
        <div className="card pad col" style={{ gap: 12 }} aria-busy="true">
          <span className="row t12 sec" style={{ gap: 8 }}>
            <span className="spin" /> Preparing PDF report
          </span>
          <Skeleton height={480} />
        </div>
      )}
    </main>
  );
}

/** The object URL lives exactly as long as this frame. */
function PdfFrame({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <iframe
      title="PDF report preview"
      src={url}
      style={{
        width: '100%',
        height: 'calc(100vh - 220px)',
        minHeight: 600,
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        background: 'var(--surface-tertiary)',
      }}
    />
  );
}
