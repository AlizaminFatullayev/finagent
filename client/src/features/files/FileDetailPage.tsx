import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, unwrap, unwrapBody } from '../../api/client';
import type { Column, FileDetail, Sheet } from '../../api/types';
import { usePageHeader } from '../../app/pageHeader';
import { useUser } from '../../auth/AuthProvider';
import { ErrorState } from '../../components/ErrorState';
import { StatusBadge, Tag } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Menu, Tabs } from '../../components/ui/Overlays';
import { Banner, Card, ProgressBar, Skeleton } from '../../components/ui/Surfaces';
import { Table } from '../../components/ui/Table';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatBytes, formatDateTime, formatDayMonth, formatNumber, plural } from '../../lib/format';
import { isToken } from '../../lib/tokens';
import { useLiveProgress } from '../../realtime/progress';
import { useSocket } from '../../realtime/SocketProvider';
import { RevealProvider } from '../reveal/RevealProvider';
import { RevealBanner, RevealSelection } from '../reveal/Token';
import { CellValue, formatDateCell, isNumeric, maskedColumns } from './cells';
import { DeleteFileDialog } from './DeleteFileDialog';
import { useFile, useUserNames } from './queries';

const PREVIEW_ROWS = 10;
const MOBILE_ROWS = 5;

/** sha256:9e1c…4b7a */
const shortHash = (h: string) => `sha256:${h.slice(0, 4)}…${h.slice(-4)}`;

export function FileDetailPage({ analyzeSlot }: { analyzeSlot?: (file: FileDetail) => ReactNode }) {
  const { fileId = '' } = useParams();
  const file = useFile(fileId);
  const { connected } = useSocket();
  // While parsing, poll when the socket is down (the socket invalidates this query otherwise).
  const live = useLiveProgress().files[fileId];
  const processing = file.data && (file.data.status === 'UPLOADED' || file.data.status === 'PROCESSING');
  useQuery({
    queryKey: ['file-poll', fileId],
    enabled: Boolean(processing) && !connected,
    refetchInterval: 3000,
    queryFn: async () => {
      await file.refetch();
      return null;
    },
  });

  usePageHeader([{ label: 'Files', to: '/files' }, { label: file.data?.originalName ?? 'File' }]);

  if (file.isPending) {
    return (
      <main className="content" id="main" aria-busy="true">
        <Skeleton height={32} width="40%" />
        <Skeleton height={16} width="60%" />
        <Card className="pad col" style={{ gap: 12 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={14} />
          ))}
        </Card>
      </main>
    );
  }
  if (file.isError) {
    return (
      <main className="content" id="main">
        <ErrorState error={file.error} onRetry={() => void file.refetch()} />
      </main>
    );
  }
  return (
    <RevealProvider fileId={fileId} key={fileId}>
      <FileDetailView file={file.data} percent={live?.percent} analyzeSlot={analyzeSlot} />
    </RevealProvider>
  );
}

function FileDetailView({
  file,
  percent,
  analyzeSlot,
}: {
  file: FileDetail;
  percent?: number;
  analyzeSlot?: (file: FileDetail) => ReactNode;
}) {
  const me = useUser();
  const ownerName = useUserNames();
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const [sheetId, setSheetId] = useState(file.sheets[0]?.id ?? '');
  const [deleting, setDeleting] = useState(false);
  const sheet = file.sheets.find((s) => s.id === sheetId) ?? file.sheets[0];
  const canDelete = file.ownerId === me.id || me.role === 'ADMIN';
  const sheetsText = plural(file.sheets.length, 'sheet');

  const menu = (
    <Menu
      items={[
        { label: 'All files', icon: 'file', to: '/files' },
        ...(canDelete
          ? ([
              'separator',
              { label: 'Delete', icon: 'trash', danger: true, onSelect: () => setDeleting(true) },
            ] as const)
          : []),
      ]}
      trigger={
        <Button variant={mobile ? 'ghost' : 'secondary'} icon aria-label="More actions">
          <Icon name="more" size={mobile ? 20 : 16} />
        </Button>
      }
    />
  );

  const status = (
    <>
      {(file.status === 'UPLOADED' || file.status === 'PROCESSING') && (
        <Banner kind="info" icon="clock" title="Parsing this file" role="status">
          Sheets, column types and masking appear here when parsing finishes.
          {percent !== undefined && (
            <span className="col" style={{ gap: 4, marginTop: 8, display: 'flex' }}>
              <ProgressBar percent={percent} label="Parsing" />
            </span>
          )}
        </Banner>
      )}
      {file.status === 'FAILED' && (
        <Banner kind="error" title="This file couldn’t be processed" role="alert">
          {file.errorMessage ?? 'The file could not be processed.'} Upload a corrected file to analyze it.
        </Banner>
      )}
    </>
  );

  const deleteDialog = (
    <DeleteFileDialog
      file={deleting ? file : null}
      onClose={() => setDeleting(false)}
      onDeleted={() => navigate('/files', { replace: true })}
    />
  );

  if (mobile) {
    return (
      <main className="mbody" id="main" style={{ paddingBottom: 16 }}>
        <div className="col" style={{ gap: 8 }}>
          <div className="row between" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              <StatusBadge status={file.status} />
              <span className="t12 sec">
                <span className="mono">{formatBytes(file.sizeBytes)}</span> · {sheetsText} ·{' '}
                {formatDayMonth(file.createdAt)}
              </span>
            </div>
            {menu}
          </div>
          <span className="t12 muted">Owner: {ownerName(file.ownerId)}</span>
        </div>
        {analyzeSlot?.(file)}
        {status}
        {sheet && (
          <>
            <Tabs
              label="Sheets"
              value={sheet.id}
              onChange={setSheetId}
              tabStyle={{ height: 44 }}
              tabs={file.sheets.map((s) => ({ value: s.id, label: s.name, count: formatNumber(s.rowCount) }))}
            >
              <SheetBody fileId={file.id} sheet={sheet} mobile />
            </Tabs>
          </>
        )}
        {deleteDialog}
      </main>
    );
  }

  return (
    <main className="content" id="main">
      <div className="row between wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 12 }}>
            <h1 className="t24 ellipsis">{file.originalName}</h1>
            <StatusBadge status={file.status} />
          </div>
          <div className="row wrap t12 sec" style={{ gap: 16 }}>
            <span>
              <span className="mono">{formatBytes(file.sizeBytes)}</span> ·{' '}
              <span className="mono">{file.sheets.length}</span>{' '}
              {file.sheets.length === 1 ? 'sheet' : 'sheets'}
            </span>
            <span>Uploaded {formatDateTime(file.createdAt)}</span>
            <span>Owner: {ownerName(file.ownerId)}</span>
            <span className="mono muted" title={`sha256:${file.sha256}`}>
              {shortHash(file.sha256)}
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {menu}
          {analyzeSlot?.(file)}
        </div>
      </div>
      {status}
      {sheet && (
        <Tabs
          label="Sheets"
          value={sheet.id}
          onChange={setSheetId}
          tabs={file.sheets.map((s) => ({
            value: s.id,
            label: s.name,
            count: `${formatNumber(s.rowCount)} rows`,
          }))}
        >
          <SheetBody fileId={file.id} sheet={sheet} />
        </Tabs>
      )}
      {deleteDialog}
    </main>
  );
}

/** Schema + masked preview of one sheet. */
function SheetBody({ fileId, sheet, mobile }: { fileId: string; sheet: Sheet; mobile?: boolean }) {
  // A larger first page tells which columns hold PII (the API has no per-column flag yet).
  const sample = useQuery({
    queryKey: ['rows', fileId, sheet.id, 'sample'],
    queryFn: () =>
      unwrap(
        api.GET('/api/files/{id}/rows', {
          params: { path: { id: fileId }, query: { sheetId: sheet.id, limit: 100 } },
        }),
      ),
  });
  const masked = maskedColumns(sample.data);
  const maskedCount = sheet.columns.filter((c) => masked[c.key]).length;
  return mobile ? (
    <>
      <MobileSchema sheet={sheet} maskedCount={maskedCount} />
      <MobilePreview fileId={fileId} sheet={sheet} />
    </>
  ) : (
    <>
      <SchemaTable sheet={sheet} masked={masked} maskedCount={maskedCount} />
      <Preview fileId={fileId} sheet={sheet} />
    </>
  );
}

function SchemaTable({
  sheet,
  masked,
  maskedCount,
}: {
  sheet: Sheet;
  masked: Record<string, string>;
  maskedCount: number;
}) {
  return (
    <section className="card" aria-labelledby="schema-title">
      <div className="cardhead">
        <h2 id="schema-title" className="t16 w6">
          Schema
        </h2>
        <span className="t12 muted">
          {plural(sheet.columns.length, 'column')} · {maskedCount} masked
        </span>
      </div>
      <Table>
        <thead>
          <tr>
            <th>Column</th>
            <th>Detected type</th>
            <th>Masking</th>
            <th>Null rate</th>
            <th style={{ textAlign: 'right' }}>Distinct</th>
          </tr>
        </thead>
        <tbody>
          {sheet.columns.map((c) => {
            const pct = c.nullRatio * 100;
            return (
              <tr key={c.key}>
                <td className="w5">{c.name}</td>
                <td>
                  <Tag>{c.type}</Tag>
                </td>
                <td>
                  {masked[c.key] ? (
                    <span className="row t12 sec" style={{ gap: 6 }}>
                      <Icon name="lock" />
                      <span className="mono">{masked[c.key]}_n</span>
                    </span>
                  ) : (
                    <span className="t12 muted">—</span>
                  )}
                </td>
                <td>
                  <span className="row" style={{ gap: 12 }}>
                    <span className="nullbar" aria-hidden="true">
                      <i style={{ width: `${pct}%` }} />
                    </span>
                    <span className="mono sec" style={{ fontSize: 12, width: 48 }}>
                      {pct.toFixed(1)}%
                    </span>
                  </span>
                </td>
                <td className="num">{formatNumber(c.distinctCount)}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </section>
  );
}

/** Cursor pages of masked rows. The API only moves forward, so Previous replays a kept cursor. */
function useRowPages(fileId: string, sheetId: string, limit: number) {
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const page = useQuery({
    queryKey: ['rows', fileId, sheetId, limit, cursor ?? 'start'],
    queryFn: () =>
      unwrapBody(
        api.GET('/api/files/{id}/rows', {
          params: { path: { id: fileId }, query: { sheetId, limit, cursor } },
        }),
      ),
    placeholderData: (prev) => prev,
  });
  return {
    page,
    index: cursors.length - 1,
    next: () => page.data?.meta.nextCursor != null && setCursors((c) => [...c, page.data!.meta.nextCursor!]),
    previous: () => setCursors((c) => (c.length > 1 ? c.slice(0, -1) : c)),
  };
}

function Preview({ fileId, sheet }: { fileId: string; sheet: Sheet }) {
  const { page, index, next, previous } = useRowPages(fileId, sheet.id, PREVIEW_ROWS);
  const rows = page.data?.data ?? [];
  const first = index * PREVIEW_ROWS + 1;
  const pages = Math.max(1, Math.ceil(sheet.rowCount / PREVIEW_ROWS));
  const [lead, ...rest] = sheet.columns;
  return (
    <section className="card" aria-labelledby="preview-title">
      <div className="cardhead wrap" style={{ gap: 12 }}>
        <div className="col" style={{ gap: 2 }}>
          <h2 id="preview-title" className="t16 w6">
            Data preview
          </h2>
          <span className="t12 muted">
            Rows{' '}
            <span className="mono">
              {formatNumber(first)}–{formatNumber(first + Math.max(rows.length, 1) - 1)}
            </span>{' '}
            of <span className="mono">{formatNumber(sheet.rowCount)}</span> · sensitive values are masked
          </span>
        </div>
        <RevealSelection />
      </div>
      <RevealBanner style={{ margin: '16px 24px 0' }} />
      {page.isError ? (
        <div style={{ padding: 24 }}>
          <ErrorState error={page.error} onRetry={() => void page.refetch()} />
        </div>
      ) : (
        <Table dense wrapStyle={{ marginTop: 8 }} aria-busy={page.isFetching}>
          <thead>
            <tr>
              {lead && (
                <th className="sticky" style={isNumeric(lead) ? { textAlign: 'right' } : undefined}>
                  {lead.name}
                </th>
              )}
              {rest.map((c) => (
                <th key={c.key} style={isNumeric(c) ? { textAlign: 'right' } : undefined}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.isPending
              ? [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}>
                    {sheet.columns.map((c) => (
                      <td key={c.key}>
                        <Skeleton height={14} width={80} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((r) => (
                  <tr key={r.rowIndex}>
                    {lead && (
                      <td className={cellClass(lead, true)}>
                        <CellValue value={r.data[lead.key]} column={lead} selectable />
                      </td>
                    )}
                    {rest.map((c) => (
                      <td key={c.key} className={cellClass(c)}>
                        <CellValue value={r.data[c.key]} column={c} selectable />
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </Table>
      )}
      <div
        className="row between wrap"
        style={{ padding: '12px 24px', borderTop: '1px solid var(--border-subtle)', gap: 8 }}
      >
        <span className="t12 muted">Click a token to select it. Scroll sideways for more columns.</span>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" disabled={index === 0} onClick={previous}>
            Previous
          </Button>
          <span className="mono t12 sec">
            Page {formatNumber(index + 1)} of {formatNumber(pages)}
          </span>
          <Button size="sm" disabled={page.data?.meta.nextCursor == null} onClick={next}>
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}

const cellClass = (c: Column, sticky = false) =>
  [sticky && 'sticky', isNumeric(c) && 'num', c.type === 'date' && 'mono', c.type === 'id' && 'mono sec']
    .filter(Boolean)
    .join(' ') || undefined;

function MobileSchema({ sheet, maskedCount }: { sheet: Sheet; maskedCount: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? sheet.columns : sheet.columns.slice(0, 5);
  return (
    <section className="card" aria-labelledby="m-schema">
      <div className="cardhead" style={{ padding: '12px 16px' }}>
        <h2 id="m-schema" className="t14 w6">
          Schema
        </h2>
        <span className="t12 muted">
          {plural(sheet.columns.length, 'column')} · {maskedCount} masked
        </span>
      </div>
      {shown.map((c) => (
        <div
          key={c.key}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 56px',
            gap: 12,
            alignItems: 'center',
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <span className="w5 ellipsis">{c.name}</span>
          <Tag>{c.type}</Tag>
          <span className="mono t12 sec" style={{ textAlign: 'right' }}>
            {(c.nullRatio * 100).toFixed(1)}%
          </span>
        </div>
      ))}
      {sheet.columns.length > 5 && (
        <Button variant="ghost" style={{ width: '100%', borderRadius: 0 }} onClick={() => setAll(!all)}>
          {all ? 'Show fewer columns' : `Show all ${sheet.columns.length} columns`}
        </Button>
      )}
    </section>
  );
}

/** Mobile preview as cards: date, amount, masked values and one text column per row. */
function MobilePreview({ fileId, sheet }: { fileId: string; sheet: Sheet }) {
  const pages = useInfiniteQuery({
    queryKey: ['rows', fileId, sheet.id, MOBILE_ROWS, 'mobile'],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      unwrapBody(
        api.GET('/api/files/{id}/rows', {
          params: {
            path: { id: fileId },
            query: { sheetId: sheet.id, limit: MOBILE_ROWS, cursor: pageParam },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const rows = pages.data?.pages.flatMap((p) => p.data) ?? [];
  const date = sheet.columns.find((c) => c.type === 'date');
  const amount = sheet.columns.find((c) => c.type === 'currency') ?? sheet.columns.find(isNumeric);
  const text = sheet.columns.find((c) => c.type === 'text' && !isToken(rows[0]?.data[c.key]));
  const tokenCols = sheet.columns.filter((c) => c !== date && c !== amount && c !== text);
  return (
    <section className="col" aria-labelledby="m-preview" style={{ gap: 8 }}>
      <div className="row between">
        <h2 id="m-preview" className="t14 w6">
          Preview
        </h2>
        <span className="t12 muted">Rows 1–{rows.length}</span>
      </div>
      <RevealBanner />
      {pages.isError && <ErrorState error={pages.error} onRetry={() => void pages.refetch()} />}
      {rows.map((r) => (
        <div
          key={r.rowIndex}
          className="card"
          style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div className="row between">
            <span className="mono t12 sec">
              {date && typeof r.data[date.key] === 'string'
                ? formatDateCell(r.data[date.key] as string)
                : `Row ${r.rowIndex}`}
            </span>
            {amount && typeof r.data[amount.key] === 'number' && (
              <span className="num w5">
                <CellValue value={r.data[amount.key]} column={amount} />
              </span>
            )}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {tokenCols
              .filter((c) => isToken(r.data[c.key]))
              .map((c) => (
                <CellValue key={c.key} value={r.data[c.key]} column={c} />
              ))}
            {text && r.data[text.key] != null && (
              <span className="t12 muted">
                <CellValue value={r.data[text.key]} column={text} />
              </span>
            )}
          </div>
        </div>
      ))}
      {pages.hasNextPage && (
        <Button
          style={{ width: '100%' }}
          loading={pages.isFetchingNextPage}
          onClick={() => void pages.fetchNextPage()}
        >
          Load next rows
        </Button>
      )}
    </section>
  );
}
