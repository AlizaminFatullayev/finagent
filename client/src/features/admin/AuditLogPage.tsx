import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Popover } from 'radix-ui';
import { Fragment, useState } from 'react';
import { api, unwrap, unwrapBody } from '../../api/client';
import type { AuditLog } from '../../api/types';
import { usePageHeader } from '../../app/pageHeader';
import { ErrorState } from '../../components/ErrorState';
import { Tag } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { FilterSelect, Trunc } from '../../components/ui/Overlays';
import { Card, EmptyState, Skeleton } from '../../components/ui/Surfaces';
import { HiddenHeader, LoadMore, Table } from '../../components/ui/Table';
import { formatBytes, formatTimestamp } from '../../lib/format';

/** Actions the server writes (server/src/modules/audit/service.ts). */
export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.refresh_reuse',
  'user.create',
  'user.role_change',
  'file.upload',
  'file.view',
  'file.delete',
  'analysis.run',
  'analysis.llm_refused',
  'analysis.llm_fallback',
  'report.export',
  'pii.unmask',
  'webhook.create',
  'webhook.delete',
] as const;

type Meta = Record<string, unknown>;
const meta = (log: AuditLog): Meta =>
  log.metadata && typeof log.metadata === 'object' ? (log.metadata as Meta) : {};
const str = (v: unknown) =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);

/** One-line details per action. PII reveals show counts, types and the reason; values are never logged. */
export function auditDetails(log: AuditLog): string {
  const m = meta(log);
  switch (log.action) {
    case 'pii.unmask': {
      const types = Array.isArray(m.tokenTypes) ? (m.tokenTypes as string[]).join(', ') : '';
      const missing = Number(m.notFoundCount) > 0 ? ` · ${m.notFoundCount} not found` : '';
      return `${m.tokenCount ?? '?'} tokens: ${types}${missing} · “${str(m.reason ?? '')}”`;
    }
    case 'file.upload':
      return [m.originalName, typeof m.sizeBytes === 'number' ? formatBytes(m.sizeBytes) : null]
        .filter(Boolean)
        .map(str)
        .join(' · ');
    case 'user.role_change':
      return `${str(m.from)} → ${str(m.to)}`;
    case 'user.create':
      return `Role ${str(m.role)}`;
    case 'report.export':
      return `Format ${str(m.format).toUpperCase()}`;
    case 'analysis.run':
      return m.cached ? 'Cached result' : 'New run';
    case 'auth.login_failed':
      return [m.reason, m.email, m.attempts !== undefined ? `attempt ${str(m.attempts)}` : null]
        .filter(Boolean)
        .map(str)
        .join(' · ');
    case 'analysis.llm_fallback':
      return `${str(m.from)} → ${str(m.to)}`;
    case 'analysis.llm_refused':
      return `Model ${str(m.model)}`;
    case 'webhook.create':
      return str(m.url ?? '');
    default:
      return Object.entries(m)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${str(v)}`)
        .join(' · ');
  }
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function AuditLogPage() {
  usePageHeader([{ label: 'Audit log' }]);
  const [actor, setActor] = useState('all');
  const [action, setAction] = useState('all');
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [open, setOpen] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['users', 'names'],
    staleTime: 5 * 60_000,
    queryFn: () => unwrap(api.GET('/api/users', { params: { query: { limit: 100 } } })),
  });
  const name = (id: string | null) =>
    id ? (users.data?.find((u) => u.id === id)?.name ?? `User ${id.slice(0, 8)}`) : 'unknown';

  // `to` is inclusive in the UI: send the start of the next day.
  const toParam = to ? new Date(Date.parse(to) + 86_400_000).toISOString() : undefined;
  const fromParam = from ? new Date(Date.parse(from)).toISOString() : undefined;
  const logs = useInfiniteQuery({
    queryKey: ['audit', actor, action, fromParam, toParam],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrapBody(
        api.GET('/api/audit-logs', {
          params: {
            query: {
              limit: 50,
              cursor: pageParam,
              actorId: actor === 'all' ? undefined : actor,
              action: action === 'all' ? undefined : action,
              from: fromParam,
              to: toParam,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const rows = logs.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <main className="content" id="main">
      <div className="col" style={{ gap: 4 }}>
        <h1 className="t24">Audit log</h1>
        <p className="sec">
          Every sign-in, file action, reveal and admin change. Entries can’t be edited or deleted.
        </p>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <FilterSelect
          label="User"
          value={actor}
          onChange={setActor}
          options={[
            { value: 'all', label: 'Anyone' },
            ...(users.data ?? []).map((u) => ({ value: u.id, label: u.name })),
          ]}
        />
        <FilterSelect
          label="Action"
          value={action}
          onChange={setAction}
          options={[{ value: 'all', label: 'All' }, ...AUDIT_ACTIONS.map((a) => ({ value: a, label: a }))]}
        />
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="select"
              aria-label={`Date range ${from || 'any'} to ${to || 'any'}`}
            >
              <Icon name="calendar" />
              <span className="mono" style={{ fontSize: 13 }}>
                {from || '…'} → {to || '…'}
              </span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="menu"
              sideOffset={4}
              align="start"
              style={{ zIndex: 50, padding: 16, gap: 12 }}
            >
              <label className="field">
                <span className="label">From</span>
                <input
                  className="input mono"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">To</span>
                <input
                  className="input mono"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <Button size="sm" variant="ghost" onClick={() => (setFrom(''), setTo(''))}>
                Any date
              </Button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {logs.isError ? (
        <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <Table dense>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <HiddenHeader>Expand</HiddenHeader>
                </th>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>IP</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.isPending &&
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}>
                    <td />
                    {[140, 100, 90, 160, 80, 220].map((w, j) => (
                      <td key={j}>
                        <Skeleton height={14} width={w} />
                      </td>
                    ))}
                  </tr>
                ))}
              {rows.map((log) => {
                const isOpen = open === log.id;
                const m = meta(log);
                const resource = log.resourceType
                  ? `${log.resourceType} ${log.resourceId?.slice(0, 8) ?? ''}`.trim()
                  : '—';
                return (
                  <Fragment key={log.id}>
                    <tr className={isOpen ? 'open' : undefined}>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon
                          aria-expanded={isOpen}
                          aria-controls={`meta-${log.id}`}
                          aria-label="Show metadata"
                          onClick={() => setOpen(isOpen ? null : log.id)}
                        >
                          <Icon
                            name="chevronRight"
                            style={{ transform: isOpen ? 'rotate(90deg)' : undefined }}
                          />
                        </Button>
                      </td>
                      <td className="mono sec">{formatTimestamp(log.createdAt)}</td>
                      <td>{name(log.actorId)}</td>
                      <td>
                        <Tag>{log.action}</Tag>
                      </td>
                      <td>
                        <Trunc text={resource} max={200} className="sec" />
                      </td>
                      <td className="mono muted">{log.ip ?? '—'}</td>
                      <td>
                        <Trunc text={auditDetails(log) || '—'} max={280} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="open" id={`meta-${log.id}`}>
                        <td />
                        <td colSpan={6} style={{ whiteSpace: 'normal', padding: '8px 16px 16px' }}>
                          <dl
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '160px 1fr',
                              gap: '8px 16px',
                              fontSize: 13,
                              margin: 0,
                            }}
                          >
                            {[
                              ['Actor', name(log.actorId)],
                              [
                                'Resource',
                                log.resourceType ? `${log.resourceType} ${log.resourceId ?? ''}` : '—',
                              ],
                              ...Object.entries(m).map(([k, v]) => [
                                k,
                                Array.isArray(v) ? v.join(', ') : str(v),
                              ]),
                              ['User agent', log.userAgent ?? '—'],
                            ].map(([k, v]) => (
                              <Fragment key={k}>
                                <dt className="muted">{k}</dt>
                                <dd
                                  className="mono"
                                  style={{ fontSize: 12, margin: 0, overflowWrap: 'anywhere' }}
                                >
                                  {v}
                                </dd>
                              </Fragment>
                            ))}
                          </dl>
                          {log.action === 'pii.unmask' && (
                            <p className="t12 muted row" style={{ gap: 8, marginTop: 12 }}>
                              <Icon name="lock" />
                              Revealed values are never stored in the audit log.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
          {logs.isSuccess && rows.length === 0 && (
            <Card style={{ border: 0 }}>
              <EmptyState icon="list" title="No entries match">
                Try another user, action or date range.
              </EmptyState>
            </Card>
          )}
          <LoadMore
            hasMore={Boolean(logs.hasNextPage)}
            loading={logs.isFetchingNextPage}
            onLoad={() => void logs.fetchNextPage()}
          />
        </div>
      )}
    </main>
  );
}
