import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { UPLOAD_LIMITS } from '../../lib/config';
import { cx } from '../../lib/cx';
import { formatNumber } from '../../lib/format';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { ProgressBar } from './Surfaces';

export type DropzoneVariant =
  | 'idle'
  | 'over'
  | 'uploading'
  | 'parsing'
  | 'success'
  | 'duplicate'
  | 'wrongFormat'
  | 'corrupted'
  | 'tooLarge'
  | 'limits';

export const ERROR_VARIANTS = ['wrongFormat', 'corrupted', 'tooLarge', 'limits'] as const;
export type DropzoneError = (typeof ERROR_VARIANTS)[number];
const isError = (v: DropzoneVariant): v is DropzoneError => (ERROR_VARIANTS as readonly string[]).includes(v);

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** Error copy from the design; limits come from config instead of the design placeholders. */
export const DROP_ERRORS: Record<DropzoneError, { title: string; body: string }> = {
  wrongFormat: { title: 'This file type isn’t supported', body: 'Upload an .xlsx or .csv file.' },
  corrupted: {
    title: 'This file can’t be read',
    body: 'Its content doesn’t match an .xlsx file, or it is damaged. Export it again from the source system and retry.',
  },
  tooLarge: {
    title: 'This file is too large',
    body: `The limit is ${mb(UPLOAD_LIMITS.maxBytes)}. Split the file by month or remove unused sheets.`,
  },
  limits: {
    title: 'Too many sheets or rows',
    body: `The limits are ${UPLOAD_LIMITS.maxSheets} sheets and ${formatNumber(UPLOAD_LIMITS.maxRows)} rows per file.`,
  },
};

export const limitsText = `Up to ${mb(UPLOAD_LIMITS.maxBytes)} · ${UPLOAD_LIMITS.maxSheets} sheets · ${formatNumber(UPLOAD_LIMITS.maxRows)} rows`;

/** Class and icon for each variant (design: Dropzone.dc.html). */
export function dropzoneView(variant: DropzoneVariant): { className: string; icon: IconName | 'fileicon' } {
  const className = cx('drop', variant === 'over' && 'over', isError(variant) && 'bad');
  const icon: Record<DropzoneVariant, IconName | 'fileicon'> = {
    idle: 'upload',
    over: 'download',
    uploading: 'fileicon',
    parsing: 'fileicon',
    success: 'check',
    duplicate: 'copy',
    wrongFormat: 'warning',
    corrupted: 'warning',
    tooLarge: 'warning',
    limits: 'warning',
  };
  return { className, icon: icon[variant] };
}

const circle = (bg: string, fg: string, border?: string) => ({
  width: 48,
  height: 48,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: bg,
  color: fg,
  border: border ? `1px solid ${border}` : undefined,
});

const ICON_STYLE: Partial<Record<DropzoneVariant, ReturnType<typeof circle>>> = {
  idle: circle('var(--accent-subtle)', 'var(--accent-text)'),
  over: circle('var(--accent)', 'var(--accent-contrast)'),
  success: circle('var(--success-bg)', 'var(--success-fg)', 'var(--success-border)'),
  duplicate: circle('var(--accent-subtle)', 'var(--accent-text)'),
};

type Props = {
  variant: DropzoneVariant;
  onFile?: (file: File) => void;
  /** File being uploaded / parsed / rejected. */
  fileName?: string;
  /** Second line under an error title (name · size) or under "Drop to upload". */
  detail?: string;
  percent?: number;
  stage?: string;
  hint?: string;
  /** Overrides the generic error body, e.g. with the server's message. */
  errorBody?: string;
  /** Success / duplicate body and actions. */
  summary?: ReactNode;
  actions?: ReactNode;
  onCancel?: () => void;
};

/**
 * The upload drop area in its ten design states. Drag and drop uses native events; the visible
 * "Choose file" button opens a hidden file input, so the control works with the keyboard alone.
 */
export function Dropzone({
  variant,
  onFile,
  fileName,
  detail,
  percent = 0,
  stage,
  hint,
  errorBody,
  summary,
  actions,
  onCancel,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const accepting = Boolean(onFile) && (variant === 'idle' || isError(variant));
  const shown: DropzoneVariant = over && accepting ? 'over' : variant;
  const view = dropzoneView(shown);

  const drag = {
    onDragEnter: (e: DragEvent) => {
      if (!accepting) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver: (e: DragEvent) => accepting && e.preventDefault(),
    onDragLeave: () => {
      // Child elements fire their own enter/leave pairs; only the outermost leave ends the hover.
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (!accepting) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile?.(file);
    },
  };

  const choose = () => input.current?.click();
  const picker = (
    <input
      ref={input}
      type="file"
      accept={UPLOAD_LIMITS.extensions.join(',')}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) onFile?.(file);
      }}
    />
  );
  const iconEl =
    view.icon === 'fileicon' ? (
      <div className="fileicon">{fileName?.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX'}</div>
    ) : (
      <div
        className={variant === 'idle' ? 'ei' : undefined}
        style={
          ICON_STYLE[shown] ?? circle('var(--sev-high-bg)', 'var(--sev-high-fg)', 'var(--sev-high-border)')
        }
      >
        <Icon name={view.icon} size={24} />
      </div>
    );

  return (
    <div className={view.className} style={{ minHeight: 320 }} {...drag} aria-live="polite">
      {picker}
      {iconEl}
      {shown === 'idle' && (
        <>
          <div className="col" style={{ gap: 4, alignItems: 'center' }}>
            <span className="t16 w6">Drag a file here</span>
            <span className="sec">or choose one from your computer</span>
          </div>
          <Button variant="primary" size="lg" onClick={choose}>
            Choose file
          </Button>
          <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
            <span className="tag">.xlsx</span>
            <span className="tag">.csv</span>
            <span className="t12 muted">{limitsText}</span>
          </div>
        </>
      )}
      {shown === 'over' && (
        <>
          <span className="t16 w6" style={{ color: 'var(--accent-text)' }}>
            Drop to upload
          </span>
          {detail && <span className="sec">{detail}</span>}
        </>
      )}
      {(shown === 'uploading' || shown === 'parsing') && (
        <>
          <div className="col" style={{ gap: 4, alignItems: 'center' }}>
            <span className="t16 w6">{fileName}</span>
            <span className="sec row" style={{ gap: 8 }}>
              <span className="pulse" />
              <span>{stage}</span>
            </span>
          </div>
          <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ProgressBar percent={percent} label={stage} />
            <div className="row between t12 muted">
              <span>{hint}</span>
              <span className="mono">{Math.round(percent)}%</span>
            </div>
          </div>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </>
      )}
      {(shown === 'success' || shown === 'duplicate') && (
        <>
          <div className="col" style={{ gap: 4, alignItems: 'center', maxWidth: 440 }}>
            <span className="t16 w6">
              {shown === 'success' ? `${fileName} is ready` : 'You already uploaded this file'}
            </span>
            <span className="sec">{summary}</span>
          </div>
          <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
            {actions}
          </div>
        </>
      )}
      {isError(shown) && (
        <>
          <div className="col" style={{ gap: 4, alignItems: 'center', maxWidth: 440 }}>
            <span className="t16 w6" role="alert">
              {DROP_ERRORS[shown].title}
            </span>
            {detail && (
              <span className="mono sec" style={{ fontSize: 12 }}>
                {detail}
              </span>
            )}
            <span className="sec">{errorBody ?? DROP_ERRORS[shown].body}</span>
          </div>
          <Button size="lg" onClick={choose}>
            Choose another file
          </Button>
        </>
      )}
    </div>
  );
}
