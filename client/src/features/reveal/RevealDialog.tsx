import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api/client';
import { ApiError, fieldErrors } from '../../api/errors';
import { CopyRequestId, retryDeadline } from '../../components/ErrorState';
import { Button } from '../../components/ui/Button';
import { TextareaField } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Overlays';
import { Banner } from '../../components/ui/Surfaces';
import { TokenChip } from '../../components/ui/TokenChip';
import { useCountdown } from '../../hooks/useCountdown';
import { formatCountdown } from '../../lib/format';
import { REVEAL_TTL_MS } from './constants';

const MIN = 5;
const MAX = 200;

type Outcome = { values: Record<string, string>; notFound: string[]; tokens: string[] };

/**
 * Reason dialog for revealing masked values (RevealStates.html): form, invalid reason, loading,
 * success, partial (not found), 403, 404, 422 and 429 with a countdown. The response never enters the
 * query cache (`gcTime: 0`, reset right after use) and is handed straight to the page's reveal store.
 */
export function RevealDialog({
  fileId,
  tokens,
  onClose,
  onRevealed,
}: {
  fileId: string;
  tokens: string[] | null;
  onClose: () => void;
  onRevealed: (values: Record<string, string>) => void;
}) {
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const wait = useCountdown(retryAt);

  const reveal = useMutation({
    gcTime: 0,
    mutationFn: (body: { tokens: string[]; reason: string }) =>
      unwrap(api.POST('/api/files/{id}/unmask', { params: { path: { id: fileId } }, body })),
  });

  const open = tokens !== null;
  const list = tokens ?? [];
  const trimmed = reason.trim().length;
  const valid = trimmed >= MIN && trimmed <= MAX;
  const touched = reason.length > 0;
  const api422 = fieldErrors(error).reason;

  const close = () => {
    setReason('');
    setOutcome(null);
    setError(null);
    setRetryAt(null);
    reveal.reset();
    onClose();
  };

  const submit = () => {
    if (!valid || reveal.isPending || wait > 0) return;
    setError(null);
    reveal.mutate(
      { tokens: list, reason: reason.trim() },
      {
        onSuccess: (data) => {
          onRevealed(data.values);
          setOutcome({ values: data.values, notFound: data.notFound, tokens: list });
          reveal.reset();
        },
        onError: (err) => {
          setError(err);
          setRetryAt(retryDeadline(err));
        },
      },
    );
  };

  // The success view shows values too, so it closes itself when they would re-mask.
  useEffect(() => {
    if (!outcome) return;
    const t = window.setTimeout(close, REVEAL_TTL_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close is stable in behaviour
  }, [outcome]);

  if (outcome) {
    const found = outcome.tokens.filter((t) => t in outcome.values);
    const title =
      outcome.notFound.length > 0
        ? `${found.length} of ${outcome.tokens.length} values revealed`
        : found.length === 1
          ? '1 value revealed'
          : `${found.length} values revealed`;
    return (
      <Modal
        open={open}
        onOpenChange={(o) => !o && close()}
        title={title}
        footer={
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        }
      >
        {outcome.notFound.length > 0 && (
          <Banner
            kind="warn"
            title={
              outcome.notFound.length === 1
                ? '1 token wasn’t found'
                : `${outcome.notFound.length} tokens weren’t found`
            }
          >
            <span className="mono">{outcome.notFound.join(', ')}</span> no longer exists in this file. It may
            have been re-processed. Refresh the page and try again.
          </Banner>
        )}
        <div className="col" style={{ gap: 8 }}>
          {found.map((t) => (
            <div key={t} className="row between" style={{ gap: 12 }}>
              <TokenChip token={t} />
              <TokenChip token={t} value={outcome.values[t]} style={{ paddingRight: 6 }} />
            </div>
          ))}
        </div>
        {found.length > 0 && (
          <div className="row t12 sec" style={{ gap: 8 }}>
            <Icon name="clock" />
            <span>
              Shown inline on the page. They hide again in <span className="mono">1:00</span>.
            </span>
          </div>
        )}
      </Modal>
    );
  }

  const apiError = error instanceof ApiError ? error : null;
  const limited = apiError?.status === 429;
  const busy = reveal.isPending;
  const title = limited
    ? 'Too many reveal requests'
    : list.length === 1
      ? 'Reveal 1 value'
      : `Reveal ${list.length} values`;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && !busy && close()}
      locked={busy}
      title={title}
      description={
        limited ? undefined : (
          <span className="row wrap" style={{ gap: 8, display: 'flex' }}>
            {list.map((t) => (
              <TokenChip key={t} token={t} />
            ))}
          </span>
        )
      }
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={busy}
            disabled={!valid || wait > 0 || apiError?.status === 403}
          >
            {busy ? 'Revealing…' : wait > 0 ? `Reveal in ${formatCountdown(wait)}` : 'Reveal'}
          </Button>
        </>
      }
    >
      {limited && (
        <Banner
          kind="error"
          icon="clock"
          role="alert"
          title={
            wait > 0 ? (
              <>
                Try again in <span className="mono">{wait}</span> seconds
              </>
            ) : (
              'You can try again now'
            )
          }
        >
          Reveals are limited per user to protect customer data. Your reason is kept.
        </Banner>
      )}
      {apiError?.status === 403 && (
        <Banner kind="error" icon="lock" role="alert" title="Your role can’t reveal values">
          Ask an administrator if you need access to original values.
        </Banner>
      )}
      {apiError?.status === 404 && (
        <Banner kind="error" role="alert" title="This file is no longer available">
          It may have been deleted. Nothing was revealed.
        </Banner>
      )}
      {apiError && apiError.status >= 500 && (
        <Banner kind="error" role="alert" title="Nothing was revealed">
          Something went wrong on our side. Try again
          {apiError.requestId && (
            <>
              , reference <CopyRequestId id={apiError.requestId} />
            </>
          )}
          .
        </Banner>
      )}
      {error !== null && !apiError && (
        <Banner kind="error" role="alert" title="Can’t reach FinAgent">
          Check your connection and try again.
        </Banner>
      )}
      <TextareaField
        label="Reason for revealing"
        value={reason}
        maxLength={MAX}
        disabled={busy}
        onChange={(e) => setReason(e.target.value.slice(0, MAX))}
        error={api422 ?? (touched && !valid ? `Write at least ${MIN} characters.` : null)}
        help={`Required, ${MIN}–${MAX} characters.`}
        placeholder="e.g. Verifying counterparty for case FIN-2231"
        autoFocus
      />
      {!limited && (
        <div className="row t12 sec" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Icon name="shield" style={{ marginTop: 2 }} />
          <span>This action is logged with your name, the time, the tokens and your reason.</span>
        </div>
      )}
    </Modal>
  );
}
