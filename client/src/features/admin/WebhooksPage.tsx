import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, unwrap, unwrapBody } from '../../api/client';
import { fieldErrors } from '../../api/errors';
import type { CreatedWebhook, Webhook } from '../../api/types';
import { usePageHeader } from '../../app/pageHeader';
import { ErrorState } from '../../components/ErrorState';
import { Tag } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Controls';
import { TextField } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { Modal, Trunc } from '../../components/ui/Overlays';
import { Banner, Card, EmptyState, Skeleton } from '../../components/ui/Surfaces';
import { notify } from '../../components/ui/Toast';
import { HiddenHeader, LoadMore, Table } from '../../components/ui/Table';
import { cx } from '../../lib/cx';
import { formatDate } from '../../lib/format';

const EVENTS = [
  { value: 'analysis.completed', label: 'Analysis completed' },
  { value: 'analysis.failed', label: 'Analysis failed' },
] as const;
type Event = (typeof EVENTS)[number]['value'];

/** The server's SSRF messages, in the design's words where it has them. */
export function urlError(message: string | undefined) {
  if (!message) return undefined;
  if (/private|loopback|link-local/i.test(message))
    return 'Private and internal addresses aren’t allowed. Use a public HTTPS endpoint.';
  if (/https/i.test(message)) return 'Use an HTTPS endpoint.';
  if (/resolve/i.test(message)) return 'This host doesn’t resolve. Check the address.';
  if (/valid URL/i.test(message)) return 'Enter a full URL, for example https://hooks.bank.az/finagent.';
  return message;
}

/**
 * Webhooks (Webhooks.html, WebhookAdd, WebhookSecret). The API has no pause toggle, last delivery or
 * delivery history (API_GAPS gap 11): activity is shown as text and history is not offered.
 */
export function WebhooksPage() {
  usePageHeader([{ label: 'Webhooks' }]);
  const queryClient = useQueryClient();
  const hooks = useInfiniteQuery({
    queryKey: ['webhooks'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrapBody(api.GET('/api/webhooks', { params: { query: { limit: 50, cursor: pageParam } } })),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<CreatedWebhook | null>(null);
  const [removing, setRemoving] = useState<Webhook | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/webhooks/{id}', { params: { path: { id } } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      notify({ icon: 'check', title: 'Webhook deleted', body: removing?.url });
      setRemoving(null);
      remove.reset();
    },
  });
  const list = hooks.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <main className="content" id="main">
      <div className="row between wrap" style={{ gap: 16 }}>
        <div className="col" style={{ gap: 4 }}>
          <h1 className="t24">Webhooks</h1>
          <p className="sec">
            Notify other systems when an analysis finishes. Requests are signed with a per-webhook secret.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Icon name="plus" />
          Add webhook
        </Button>
      </div>
      {hooks.isError ? (
        <ErrorState error={hooks.error} onRetry={() => void hooks.refetch()} />
      ) : hooks.isSuccess && list.length === 0 ? (
        <Card>
          <EmptyState
            icon="link"
            title="No webhooks yet"
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add webhook
              </Button>
            }
          >
            Notify another system when an analysis finishes.
          </EmptyState>
        </Card>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <th>Endpoint URL</th>
                <th>Events</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ width: 120 }}>
                  <HiddenHeader>Actions</HiddenHeader>
                </th>
              </tr>
            </thead>
            <tbody>
              {hooks.isPending &&
                [1, 2, 3].map((i) => (
                  <tr key={i}>
                    {[320, 200, 80, 90, 60].map((w, j) => (
                      <td key={j}>
                        <Skeleton height={14} width={w} />
                      </td>
                    ))}
                  </tr>
                ))}
              {list.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Trunc text={h.url} max={320} className="mono" />
                  </td>
                  <td>
                    <span className="row" style={{ gap: 4 }}>
                      {h.events.map((e) => (
                        <Tag key={e}>{e}</Tag>
                      ))}
                    </span>
                  </td>
                  <td>
                    <span className={cx('badge', h.isActive ? 'b-ready' : undefined)}>
                      {h.isActive ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="sec">{formatDate(h.createdAt)}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRemoving(h)}
                      aria-label={`Delete webhook ${h.url}`}
                    >
                      <Icon name="trash" />
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <LoadMore
            hasMore={Boolean(hooks.hasNextPage)}
            loading={hooks.isFetchingNextPage}
            onLoad={() => void hooks.fetchNextPage()}
          />
        </div>
      )}
      {adding && (
        <AddWebhook
          onClose={() => setAdding(false)}
          onCreated={(w) => {
            setAdding(false);
            setCreated(w);
            void queryClient.invalidateQueries({ queryKey: ['webhooks'] });
          }}
        />
      )}
      {created && <SecretOnce webhook={created} onClose={() => setCreated(null)} />}
      <Modal
        open={removing !== null}
        onOpenChange={(o) => !o && !remove.isPending && setRemoving(null)}
        role="alertdialog"
        maxWidth={440}
        title="Delete this webhook?"
        description={
          <>
            <span className="mono" style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
              {removing?.url}
            </span>{' '}
            will stop receiving events. This can’t be undone.
          </>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => removing && remove.mutate(removing.id)}
            >
              Delete webhook
            </Button>
          </>
        }
      >
        {remove.isError && (
          <Banner kind="error" role="alert" title="The webhook wasn’t deleted">
            Try again in a moment.
          </Banner>
        )}
        <p className="t12 muted">The deletion is recorded in the audit log.</p>
      </Modal>
    </main>
  );
}

function AddWebhook({ onClose, onCreated }: { onClose: () => void; onCreated: (w: CreatedWebhook) => void }) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<Event[]>(['analysis.completed', 'analysis.failed']);
  const create = useMutation({
    gcTime: 0,
    mutationFn: () => unwrap(api.POST('/api/webhooks', { body: { url: url.trim(), events } })),
    onSuccess: (w) => {
      create.reset();
      onCreated(w);
    },
  });
  const errors = fieldErrors(create.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim() && events.length) create.mutate();
  };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && !create.isPending && onClose()}
      title="Add webhook"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="add-webhook"
            loading={create.isPending}
            disabled={!url.trim() || events.length === 0}
          >
            Add webhook
          </Button>
        </>
      }
    >
      <form id="add-webhook" className="col" style={{ gap: 16 }} onSubmit={submit} noValidate>
        <TextField
          label="Endpoint URL"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.bank.az/finagent"
          error={urlError(errors.url)}
          help="HTTPS only."
          maxLength={2048}
          required
        />
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 8 }}>
            Events
          </legend>
          {EVENTS.map((ev) => (
            <Checkbox
              key={ev.value}
              checked={events.includes(ev.value)}
              onChange={(on) =>
                setEvents((list) => (on ? [...list, ev.value] : list.filter((x) => x !== ev.value)))
              }
            >
              <span className="grow">{ev.label}</span>
              <Tag>{ev.value}</Tag>
            </Checkbox>
          ))}
          {events.length === 0 && <span className="err">Choose at least one event.</span>}
        </fieldset>
        {create.isError && !errors.url && (
          <Banner kind="error" role="alert" title="The webhook wasn’t added">
            Try again in a moment.
          </Banner>
        )}
      </form>
    </Modal>
  );
}

/** The signing secret exists only in this dialog's props; closing it drops the last copy. */
function SecretOnce({ webhook, onClose }: { webhook: CreatedWebhook; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      open
      onOpenChange={() => {}}
      locked
      maxWidth={520}
      title="Webhook added"
      description={
        <span className="mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
          {webhook.url}
        </span>
      }
      footer={
        <Button variant="primary" onClick={onClose}>
          I’ve saved the secret
        </Button>
      }
    >
      <div className="field">
        <span className="label">Signing secret</span>
        <div
          className="row"
          style={{
            gap: 8,
            padding: '4px 4px 4px 12px',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            background: 'var(--surface-secondary)',
          }}
        >
          <span className="mono grow" style={{ overflowWrap: 'anywhere', fontSize: 12 }} data-sensitive>
            {webhook.secret}
          </span>
          <Button
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(webhook.secret).then(() => setCopied(true))}
          >
            <Icon name={copied ? 'check' : 'copy'} />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
      <Banner kind="warn" title="You won’t see this secret again">
        Store it in your receiving system now. Use it to verify the signature header on each request.
      </Banner>
    </Modal>
  );
}
