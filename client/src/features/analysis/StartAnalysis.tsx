import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, unwrapBody } from '../../api/client';
import { ApiError } from '../../api/errors';
import type { FileDetail } from '../../api/types';
import { CopyRequestId, retryDeadline } from '../../components/ErrorState';
import { Tag } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Checkbox, Segmented } from '../../components/ui/Controls';
import { SearchInput } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { Banner } from '../../components/ui/Surfaces';
import { notify } from '../../components/ui/Toast';
import { useCountdown } from '../../hooks/useCountdown';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatCountdown, formatDateTime, formatNumber, plural } from '../../lib/format';
import { useFileAnalyses } from '../files/queries';

const MAX_FOCUS = 20;
type Language = 'en' | 'az';
const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'az', label: 'Azərbaycan' },
];

const sameColumns = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/**
 * Start analysis (StartAnalysis.html as a right panel, AnalyzeMobile.html as a bottom sheet): output
 * language, optional searchable focus columns, and a notice when an identical completed analysis
 * exists (the API would serve it from cache).
 */
export function StartAnalysis({
  file,
  open,
  onOpenChange,
}: {
  file: FileDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState<Language>('en');
  const [focus, setFocus] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const wait = useCountdown(retryAt);
  const history = useFileAnalyses(file.id);

  // Column names (the agent receives names), with the sheets they appear in.
  const columns = new Map<string, { sheets: string[]; type: string }>();
  for (const s of file.sheets)
    for (const c of s.columns) {
      const entry = columns.get(c.name);
      if (entry) entry.sheets.push(s.name);
      else columns.set(c.name, { sheets: [s.name], type: c.type });
    }
  const q = query.trim().toLowerCase();
  const options = [...columns].filter(([name]) => !q || name.toLowerCase().includes(q));
  const rows = file.sheets.reduce((n, s) => n + s.rowCount, 0);

  const previous = history.data?.data.find(
    (a) => a.status === 'COMPLETED' && a.language === language && sameColumns(a.params.focusColumns, focus),
  );

  const start = useMutation({
    mutationFn: () =>
      unwrapBody(
        api.POST('/api/files/{id}/analyses', {
          params: { path: { id: file.id } },
          body: { language, focusColumns: focus },
        }),
      ),
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: ['analyses', file.id] });
      queryClient.setQueryData(['analysis', data.id], data);
      if (data.cached)
        notify({
          icon: 'refresh',
          title: 'Previous result reused',
          body: 'Same file, language and columns.',
        });
      onOpenChange(false);
      navigate(`/analyses/${data.id}`);
    },
    onError: (err) => setRetryAt(retryDeadline(err)),
  });
  const error = start.error instanceof ApiError ? start.error : null;

  const toggle = (name: string) =>
    setFocus((f) =>
      f.includes(name) ? f.filter((x) => x !== name) : f.length >= MAX_FOCUS ? f : [...f, name],
    );

  const body = (
    <>
      {previous && (
        <Banner
          kind="info"
          icon="refresh"
          title="A previous result is available"
          action={
            <ButtonLink
              to={`/analyses/${previous.id}`}
              size="sm"
              variant="primary"
              onClick={() => onOpenChange(false)}
            >
              {mobile ? 'Open previous' : 'Open previous result'}
            </ButtonLink>
          }
        >
          Same file, language and columns. Run {formatDateTime(previous.createdAt)}. Starting again returns
          this result.
        </Banner>
      )}
      {error?.status === 429 && (
        <Banner
          kind="error"
          icon="clock"
          role="alert"
          title={
            wait > 0
              ? `Analysis limit reached. Try again in ${formatCountdown(wait)}.`
              : 'You can start an analysis again.'
          }
        >
          Analyses are limited per user each hour.
        </Banner>
      )}
      {error?.status === 409 && (
        <Banner kind="warn" role="alert" title="This file isn’t ready for analysis">
          Wait until parsing has finished, then try again.
        </Banner>
      )}
      {start.isError && error?.status !== 429 && error?.status !== 409 && (
        <Banner kind="error" role="alert" title="The analysis didn’t start">
          {error?.status === 422 ? 'Check the selected columns and try again.' : 'Try again in a moment.'}
          {error?.requestId && (
            <>
              {' '}
              Reference <CopyRequestId id={error.requestId} />
            </>
          )}
        </Banner>
      )}
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 8 }}>
          Output language
        </legend>
        <Segmented
          label="Output language"
          value={language}
          onChange={setLanguage}
          options={LANGUAGES}
          className={mobile ? 'grid grid-cols-2' : 'self-start'}
        />
        {!mobile && (
          <span className="help">
            Language of the summary, risks and recommendations. Column names stay as in the file.
          </span>
        )}
      </fieldset>
      <div className="field">
        <span className="label" id="focus-label">
          Focus columns{' '}
          <span className="muted" style={{ fontWeight: 400 }}>
            (optional)
          </span>
        </span>
        <div className="card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {focus.length > 0 && (
            <div className="row wrap" style={{ gap: 6 }}>
              {focus.map((name) => (
                <span key={name} className="chip" style={{ height: 28, paddingRight: 2 }}>
                  {name}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    aria-label={`Remove ${name}`}
                    style={{ width: 24, height: 24, minWidth: 0 }}
                    onClick={() => toggle(name)}
                  >
                    <Icon name="x" />
                  </Button>
                </span>
              ))}
            </div>
          )}
          <SearchInput
            placeholder="Search columns"
            aria-label="Search columns"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div
            className="col"
            role="group"
            aria-labelledby="focus-label"
            style={{ maxHeight: mobile ? 200 : undefined, overflowY: 'auto' }}
          >
            {options.map(([name, info]) => (
              <Checkbox
                key={name}
                checked={focus.includes(name)}
                onChange={() => toggle(name)}
                disabled={!focus.includes(name) && focus.length >= MAX_FOCUS}
                className="w-full rounded-sm px-2 py-1 min-h-9"
              >
                <span className="grow">{name}</span>
                <span className="t12 muted">{info.sheets.join(', ')}</span>
                <Tag>{info.type}</Tag>
              </Checkbox>
            ))}
            {options.length === 0 && (
              <span className="t12 muted" style={{ padding: 8 }}>
                No column matches “{query}”.
              </span>
            )}
          </div>
        </div>
        <span className="help">
          Leave empty to analyze every column.{focus.length >= MAX_FOCUS && ` Up to ${MAX_FOCUS} columns.`}
        </span>
      </div>
    </>
  );

  const submit = (
    <Button
      variant="primary"
      loading={start.isPending}
      disabled={wait > 0}
      onClick={() => start.mutate()}
      style={mobile ? { width: '100%' } : undefined}
    >
      {start.isPending ? 'Starting…' : wait > 0 ? `Start in ${formatCountdown(wait)}` : 'Start analysis'}
    </Button>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: 40 }} />
        <Dialog.Content
          className={mobile ? 'sheet' : 'drawer'}
          style={mobile ? { maxHeight: '90vh' } : { width: 'min(480px, 100%)' }}
        >
          {mobile && <div className="grab" />}
          <div
            className="row between"
            style={{
              padding: mobile ? '12px 16px 8px' : '20px 24px',
              borderBottom: mobile ? 0 : '1px solid var(--border-subtle)',
            }}
          >
            <div className="col" style={{ gap: 2, minWidth: 0 }}>
              <Dialog.Title className="t20">Start analysis</Dialog.Title>
              <Dialog.Description className={mobile ? 'sr-only' : 't12 muted ellipsis'}>
                {file.originalName} · {plural(file.sheets.length, 'sheet')} · {formatNumber(rows)} rows
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" icon aria-label="Close">
                <Icon name="x" size={20} />
              </Button>
            </Dialog.Close>
          </div>
          <div
            style={{
              flex: '1 1 0%',
              overflow: 'auto',
              padding: mobile ? '0 16px 16px' : 24,
              display: 'flex',
              flexDirection: 'column',
              gap: mobile ? 20 : 24,
            }}
          >
            {body}
            {mobile && submit}
          </div>
          {!mobile && (
            <div
              className="row"
              style={{
                justifyContent: 'flex-end',
                gap: 8,
                padding: '16px 24px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <Dialog.Close asChild>
                <Button variant="ghost">Cancel</Button>
              </Dialog.Close>
              {submit}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
