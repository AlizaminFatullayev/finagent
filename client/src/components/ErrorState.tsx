import { useState } from 'react';
import { ApiError } from '../api/errors';
import { useCountdown } from '../hooks/useCountdown';
import { formatCountdown } from '../lib/format';
import { Button, ButtonLink } from './ui/Button';
import { Icon } from './ui/Icon';
import { Card, EmptyState } from './ui/Surfaces';

/** Copies a request id for support; the id is not sensitive. */
export function CopyRequestId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="row" style={{ gap: 4, display: 'inline-flex' }}>
      <span className="mono">{id}</span>
      <Button
        variant="ghost"
        size="sm"
        icon
        aria-label={copied ? 'Request id copied' : 'Copy request id'}
        onClick={() => {
          void navigator.clipboard?.writeText(id).then(() => setCopied(true));
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} />
      </Button>
    </span>
  );
}

/** Seconds from a 429, as an absolute deadline for useCountdown. */
export const retryDeadline = (error: unknown) =>
  error instanceof ApiError && error.status === 429 ? Date.now() + (error.retryAfter ?? 30) * 1000 : null;

/** Page-level error from the API envelope: 403, 404, 429 with a live countdown, 500 with request id. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : null;
  const [until] = useState(() => retryDeadline(error));
  const seconds = useCountdown(until);

  let body;
  if (api?.status === 403) {
    body = (
      <EmptyState
        icon="lock"
        code="403"
        title="You don’t have access to this"
        action={<ButtonLink to="/">Go to dashboard</ButtonLink>}
      >
        Your role can’t open this page or resource. Ask a manager or an administrator if you need it.
      </EmptyState>
    );
  } else if (api?.status === 404) {
    body = (
      <EmptyState
        icon="search"
        code="404"
        title="Not found"
        action={<ButtonLink to="/">Go to dashboard</ButtonLink>}
      >
        It may have been deleted, or it belongs to someone else.
      </EmptyState>
    );
  } else if (api?.status === 429) {
    body = (
      <EmptyState
        icon="clock"
        code="429"
        title="Too many requests"
        action={
          <Button disabled={seconds > 0} onClick={onRetry}>
            {seconds > 0 ? `Retry in ${formatCountdown(seconds)}` : 'Retry'}
          </Button>
        }
      >
        {seconds > 0 ? (
          <>
            Try again in <span className="mono">{seconds}</span> seconds.
          </>
        ) : (
          'You can try again now.'
        )}
      </EmptyState>
    );
  } else {
    body = (
      <EmptyState
        icon="warning"
        code={api ? String(api.status) : undefined}
        title="Something went wrong"
        action={
          onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      >
        Your data is safe. Try again
        {api?.requestId ? (
          <>
            , or contact support with <CopyRequestId id={api.requestId} />
          </>
        ) : (
          ' in a moment'
        )}
        .
      </EmptyState>
    );
  }
  return (
    <Card role="alert" aria-live="assertive">
      {body}
    </Card>
  );
}
