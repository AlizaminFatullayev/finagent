import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, unwrap } from '../../api/client';
import { ApiError } from '../../api/errors';
import type { FileDetail, FileItem } from '../../api/types';
import { uploadFile } from '../../api/upload';
import { usePageHeader } from '../../app/pageHeader';
import { retryDeadline } from '../../components/ErrorState';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Dropzone, limitsText, type DropzoneError } from '../../components/ui/Dropzone';
import { Icon } from '../../components/ui/Icon';
import { Banner } from '../../components/ui/Surfaces';
import { useCountdown } from '../../hooks/useCountdown';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { UPLOAD_LIMITS } from '../../lib/config';
import { formatBytes, formatDateTime, formatNumber, plural } from '../../lib/format';
import { useLiveProgress } from '../../realtime/progress';
import { useSocket } from '../../realtime/SocketProvider';

type State =
  | { kind: 'idle' }
  | { kind: 'uploading'; name: string; loaded: number; total: number; startedAt: number }
  | { kind: 'parsing'; file: FileItem }
  | { kind: 'duplicate'; file: FileItem }
  | { kind: 'error'; variant: DropzoneError; detail: string; body?: string }
  | { kind: 'failed'; error: unknown };

const nameAndSize = (f: { name: string; size: number }) => `${f.name} · ${formatBytes(f.size)}`;

/** Client-side pre-check that mirrors the server; the server stays the authority. */
export function precheck(file: { name: string; size: number }): State | null {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!(UPLOAD_LIMITS.extensions as readonly string[]).includes(ext))
    return { kind: 'error', variant: 'wrongFormat', detail: file.name };
  if (file.size > UPLOAD_LIMITS.maxBytes)
    return { kind: 'error', variant: 'tooLarge', detail: nameAndSize(file) };
  return null;
}

/** Maps a rejected upload to a dropzone variant (server/src/domain/ingest/inspect.ts messages). */
export function rejection(err: unknown, file: { name: string; size: number }): State {
  if (!(err instanceof ApiError)) return { kind: 'failed', error: err };
  if (err.status === 413) return { kind: 'error', variant: 'tooLarge', detail: nameAndSize(file) };
  if (err.status === 400 && err.code === 'UNSUPPORTED_FILE') {
    if (/only \.xlsx and \.csv/i.test(err.message))
      return { kind: 'error', variant: 'wrongFormat', detail: file.name };
    if (/more than \d+ (sheets|rows)/i.test(err.message))
      return { kind: 'error', variant: 'limits', detail: file.name, body: `${err.message}.` };
    return { kind: 'error', variant: 'corrupted', detail: file.name };
  }
  return { kind: 'failed', error: err };
}

/** Ingest failures arrive later as `errorMessage`; limits and unreadable content map to the same variants. */
const ingestFailure = (f: FileItem): State =>
  /more than \d+ (sheets|rows)/i.test(f.errorMessage ?? '')
    ? { kind: 'error', variant: 'limits', detail: f.originalName, body: `${f.errorMessage}.` }
    : {
        kind: 'error',
        variant: 'corrupted',
        detail: f.originalName,
        body: f.errorMessage ? `${f.errorMessage}.` : undefined,
      };

export function UploadPage() {
  const mobile = useIsMobile();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const wait = useCountdown(retryAt);
  const abort = useRef<AbortController | null>(null);
  usePageHeader([{ label: 'Upload' }]);

  async function start(file: File) {
    const rejected = precheck(file);
    if (rejected) return setState(rejected);
    const controller = new AbortController();
    abort.current = controller;
    setRetryAt(null);
    const startedAt = Date.now();
    setState({ kind: 'uploading', name: file.name, loaded: 0, total: file.size, startedAt });
    try {
      const result = await uploadFile(
        file,
        ({ loaded, total }) => setState({ kind: 'uploading', name: file.name, loaded, total, startedAt }),
        controller.signal,
      );
      setState(
        result.deduplicated
          ? { kind: 'duplicate', file: result.file }
          : { kind: 'parsing', file: result.file },
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return setState({ kind: 'idle' });
      if (err instanceof ApiError && err.status === 429) {
        setRetryAt(retryDeadline(err));
        return setState({ kind: 'idle' });
      }
      setState(rejection(err, file));
    }
  }

  const reset = () => setState({ kind: 'idle' });

  return (
    <main
      className={mobile ? 'mbody' : 'content'}
      id="main"
      style={mobile ? { paddingBottom: 16 } : { maxWidth: 880 }}
    >
      {mobile ? (
        <p className="sec">Sensitive values are masked as soon as the file is parsed.</p>
      ) : (
        <div className="col" style={{ gap: 4 }}>
          <h1 className="t24">Upload a file</h1>
          <p className="sec">
            FinAgent parses each sheet, infers column types and masks sensitive values before anyone sees the
            data.
          </p>
        </div>
      )}
      {wait > 0 && (
        <Banner kind="error" icon="clock" role="alert" title="Too many uploads">
          Try again in <span className="mono">{wait}</span> seconds.
        </Banner>
      )}
      {state.kind === 'failed' && (
        <Banner
          kind="error"
          role="alert"
          title="The upload didn’t go through"
          action={
            <Button size="sm" onClick={reset}>
              Try again
            </Button>
          }
        >
          {state.error instanceof ApiError
            ? `${state.error.message}${state.error.requestId ? ` (ref ${state.error.requestId})` : ''}`
            : 'Check your connection and try again.'}
        </Banner>
      )}
      {state.kind === 'parsing' ? (
        <Parsing file={state.file} onDone={setState} onReset={reset} />
      ) : (
        <Dropzone
          variant={
            state.kind === 'uploading'
              ? 'uploading'
              : state.kind === 'duplicate'
                ? 'duplicate'
                : state.kind === 'error'
                  ? state.variant
                  : 'idle'
          }
          onFile={wait > 0 ? undefined : (f) => void start(f)}
          fileName={state.kind === 'uploading' ? state.name : undefined}
          percent={state.kind === 'uploading' && state.total ? (state.loaded / state.total) * 100 : 0}
          stage={
            state.kind === 'uploading'
              ? `Uploading · ${formatBytes(state.loaded)} of ${formatBytes(state.total)}`
              : undefined
          }
          hint={state.kind === 'uploading' ? timeLeft(state) : undefined}
          onCancel={state.kind === 'uploading' ? () => abort.current?.abort() : undefined}
          detail={state.kind === 'error' ? state.detail : undefined}
          errorBody={state.kind === 'error' ? state.body : undefined}
          summary={
            state.kind === 'duplicate' && (
              <>
                Same content as{' '}
                <b className="w5" style={{ color: 'var(--text-primary)' }}>
                  {state.file.originalName}
                </b>
                , uploaded {formatDateTime(state.file.createdAt)}.
              </>
            )
          }
          actions={
            state.kind === 'duplicate' && (
              <>
                <ButtonLink to={`/files/${state.file.id}`} variant="primary" size="lg">
                  Open existing file
                </ButtonLink>
                <Button size="lg" onClick={reset}>
                  Choose a different file
                </Button>
              </>
            )
          }
        />
      )}
      {mobile ? (
        <div className="card pad16 col" style={{ gap: 8 }}>
          <span className="over">Accepted</span>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="tag">.xlsx</span>
            <span className="tag">.csv</span>
          </div>
          <span className="t12 muted">{limitsText}</span>
        </div>
      ) : (
        <div className="row t12 muted" style={{ gap: 8 }}>
          <Icon name="shield" />
          <span>
            Names, IBANs, card numbers, phones and emails are replaced with tokens like{' '}
            <span className="tok" style={{ height: 20, paddingRight: 6 }}>
              [IBAN_1]
            </span>
            . Revealing a value requires a reason and is logged.
          </span>
        </div>
      )}
    </main>
  );
}

function timeLeft(s: { loaded: number; total: number; startedAt: number }) {
  const elapsed = (Date.now() - s.startedAt) / 1000;
  if (s.loaded === 0 || elapsed < 0.5) return 'Starting…';
  const left = Math.ceil(((s.total - s.loaded) / s.loaded) * elapsed);
  return left <= 1 ? 'Almost done' : `About ${left} seconds left`;
}

/** Parsing: live percent from `file:ingest:progress`; polls the file when the socket is down. */
function Parsing({
  file,
  onDone,
  onReset,
}: {
  file: FileItem;
  onDone: (s: State) => void;
  onReset: () => void;
}) {
  const { connected } = useSocket();
  const live = useLiveProgress().files[file.id];
  const detail = useQuery({
    queryKey: ['file', file.id],
    queryFn: () => unwrap(api.GET('/api/files/{id}', { params: { path: { id: file.id } } })),
    refetchInterval: (q) => {
      const s = (q.state.data as FileDetail | undefined)?.status;
      return s === 'READY' || s === 'FAILED' ? false : connected ? 15_000 : 2_000;
    },
  });
  const current = detail.data;
  useEffect(() => {
    if (current?.status === 'FAILED') onDone(ingestFailure(current));
  }, [current, onDone]);
  if (current?.status === 'READY') {
    const rows = current.sheets.reduce((n, s) => n + s.rowCount, 0);
    const columns = current.sheets.reduce((n, s) => n + s.columns.length, 0);
    return (
      <Dropzone
        variant="success"
        fileName={current.originalName}
        summary={
          <>
            <span className="mono">{current.sheets.length}</span>{' '}
            {current.sheets.length === 1 ? 'sheet' : 'sheets'} ·{' '}
            <span className="mono">{formatNumber(rows)}</span> rows · {plural(columns, 'column')}
          </>
        }
        actions={
          <>
            <ButtonLink to={`/files/${current.id}`} variant="primary" size="lg">
              Go to file
            </ButtonLink>
            <Button size="lg" onClick={onReset}>
              Upload another
            </Button>
          </>
        }
      />
    );
  }
  const percent = live?.percent ?? 0;
  return (
    <Dropzone
      variant="parsing"
      fileName={file.originalName}
      percent={percent}
      stage={percent > 0 ? 'Parsing' : 'Queued for parsing'}
      hint={percent >= 40 ? 'Inferring column types and masking sensitive values' : 'Reading sheets'}
    />
  );
}
