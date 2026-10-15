import { useState } from 'react';
import { fetchBlob, saveBlob } from '../../api/download';
import { ApiError } from '../../api/errors';
import { retryDeadline } from '../../components/ErrorState';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Menu } from '../../components/ui/Overlays';
import { notify } from '../../components/ui/Toast';
import { useCountdown } from '../../hooks/useCountdown';
import { formatBytes, formatCountdown } from '../../lib/format';

export type ExportFormat = 'xlsx' | 'pdf';
const LABEL: Record<ExportFormat, string> = { xlsx: 'Excel workbook', pdf: 'PDF report' };

/** Downloads one export; resolves the filename from Content-Disposition. */
export async function downloadExport(analysisId: string, format: ExportFormat) {
  const { blob, filename } = await fetchBlob(
    `/api/analyses/${analysisId}/export?format=${format}`,
    `finagent-report-${analysisId}.${format}`,
  );
  saveBlob(blob, filename);
  return { filename, size: blob.size };
}

/** Export (Export.html): menu, generating, downloaded toast with "Download again", error, rate limit. */
export function ExportMenu({ analysisId, mobile }: { analysisId: string; mobile?: boolean }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const wait = useCountdown(retryAt);

  async function run(format: ExportFormat) {
    setBusy(format);
    try {
      const { filename, size } = await downloadExport(analysisId, format);
      notify({
        icon: 'check',
        title: 'Export ready',
        body: <span className="mono">{`${filename} · ${formatBytes(size)}`}</span>,
        action: (
          <button
            type="button"
            className="t12 w5"
            style={{ color: 'var(--accent-text)', textAlign: 'left' }}
            onClick={() => void run(format)}
          >
            Download again
          </button>
        ),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setRetryAt(retryDeadline(err));
      else
        notify({
          icon: 'alert',
          error: true,
          title: 'Export failed',
          body: `The ${format === 'pdf' ? 'PDF' : 'Excel file'} couldn’t be generated. Nothing was downloaded.`,
          action: (
            <div>
              <Button size="sm" onClick={() => void run(format)}>
                Try again
              </Button>
            </div>
          ),
        });
    } finally {
      setBusy(null);
    }
  }

  if (wait > 0) {
    return (
      <Button variant="primary" disabled title="Too many exports">
        Export available in {formatCountdown(wait)}
      </Button>
    );
  }
  if (busy) {
    return (
      <Button variant={mobile ? 'secondary' : 'primary'} loading aria-live="polite">
        Generating {busy === 'pdf' ? 'PDF' : 'Excel'}…
      </Button>
    );
  }
  return (
    <Menu
      width={260}
      items={[
        {
          label: LABEL.xlsx,
          hint: 'Metrics, anomalies, masked data',
          lead: <span className="tag">XLSX</span>,
          onSelect: () => void run('xlsx'),
        },
        {
          label: LABEL.pdf,
          hint: 'Summary for sharing',
          lead: <span className="tag">PDF</span>,
          onSelect: () => void run('pdf'),
        },
        'separator',
        { label: 'Preview PDF report', icon: 'eye', to: `/analyses/${analysisId}/report` },
      ]}
      trigger={
        <Button
          variant={mobile ? 'secondary' : 'primary'}
          aria-haspopup="menu"
          style={mobile ? { width: '100%' } : undefined}
        >
          {!mobile && <Icon name="download" />}
          Export
          {!mobile && <Icon name="chevronDown" />}
        </Button>
      }
    />
  );
}
