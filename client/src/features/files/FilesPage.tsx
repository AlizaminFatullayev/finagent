import { useState } from 'react';
import { Link } from 'react-router';
import type { FileItem, FileStatus } from '../../api/types';
import { usePageHeader } from '../../app/pageHeader';
import { canSeeAllFiles, useUser } from '../../auth/AuthProvider';
import { ErrorState } from '../../components/ErrorState';
import { StatusBadge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { SearchInput } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { FilterSelect, Menu } from '../../components/ui/Overlays';
import { Card, EmptyState, Skeleton } from '../../components/ui/Surfaces';
import { HiddenHeader, LoadMore, Table } from '../../components/ui/Table';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatBytes, formatDateTime, formatDayMonth } from '../../lib/format';
import { DeleteFileDialog } from './DeleteFileDialog';
import { useFiles, useUserNames } from './queries';

type StatusFilter = 'all' | FileStatus;
type OwnerFilter = 'anyone' | 'me' | 'others';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'READY', label: 'Ready' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'UPLOADED', label: 'Uploaded' },
  { value: 'FAILED', label: 'Failed' },
];

/** Files list (Files.html / FilesAnalyst.html / FilesMobile.html). */
export function FilesPage() {
  const me = useUser();
  const all = canSeeAllFiles(me.role);
  const mobile = useIsMobile();
  const files = useFiles();
  const ownerName = useUserNames();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [owner, setOwner] = useState<OwnerFilter>('anyone');
  const [deleting, setDeleting] = useState<FileItem | null>(null);

  usePageHeader(
    [{ label: 'Files' }],
    <ButtonLink to="/upload" variant="primary" icon aria-label="Upload file">
      <Icon name="plus" size={20} />
    </ButtonLink>,
  );

  const loaded = files.data?.pages.flatMap((p) => p.data) ?? [];
  // Search and filters apply to the pages loaded so far; the API has no query parameters yet (API_GAPS gap 2).
  const q = query.trim().toLowerCase();
  const shown = loaded.filter(
    (f) =>
      (!q || f.originalName.toLowerCase().includes(q)) &&
      (status === 'all' || f.status === status) &&
      (owner === 'anyone' || (owner === 'me') === (f.ownerId === me.id)),
  );
  const filtered = Boolean(q) || status !== 'all' || owner !== 'anyone';
  const clear = () => {
    setQuery('');
    setStatus('all');
    setOwner('anyone');
  };
  const canDelete = (f: FileItem) => f.ownerId === me.id || me.role === 'ADMIN';
  const rowMenu = (f: FileItem) => (
    <Menu
      items={[
        { label: 'Open', icon: 'eye', to: `/files/${f.id}` },
        ...(f.status === 'READY'
          ? [{ label: 'Analyze', icon: 'play' as const, to: `/files/${f.id}?analyze=1` }]
          : []),
        ...(canDelete(f)
          ? ([
              'separator',
              { label: 'Delete', icon: 'trash', danger: true, onSelect: () => setDeleting(f) },
            ] as const)
          : []),
      ]}
      trigger={
        <Button variant="ghost" size="sm" icon aria-label={`Actions for ${f.originalName}`}>
          <Icon name="more" />
        </Button>
      }
    />
  );

  const empty =
    !files.isPending && shown.length === 0 ? (
      filtered ? (
        <EmptyState
          icon="search"
          title="No files match"
          action={<Button onClick={clear}>Clear filters</Button>}
        >
          {files.hasNextPage
            ? 'Only the files loaded so far are searched. Load more, or try another name.'
            : 'Try another name or clear the status filter.'}
        </EmptyState>
      ) : (
        <EmptyState
          icon="file"
          title="No files yet"
          action={
            <ButtonLink to="/upload" variant="primary">
              Upload a file
            </ButtonLink>
          }
        >
          Upload an .xlsx or .csv file to get statistics, anomalies and a summary.
        </EmptyState>
      )
    ) : null;

  if (files.isError) {
    return (
      <main className={mobile ? 'mbody' : 'content'} id="main">
        <ErrorState error={files.error} onRetry={() => void files.refetch()} />
      </main>
    );
  }

  if (mobile) {
    return (
      <main className="mbody" id="main" style={{ gap: 12, paddingBottom: 16 }}>
        <SearchInput
          placeholder="Search by file name"
          aria-label="Search by file name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="row" style={{ gap: 8, overflowX: 'auto' }} role="group" aria-label="Status">
          {(['all', 'READY', 'PROCESSING', 'FAILED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className="btn btn-sm"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              style={
                status === s
                  ? {
                      height: 44,
                      borderColor: 'var(--accent)',
                      color: 'var(--accent-text)',
                      background: 'var(--accent-subtle)',
                    }
                  : { height: 44 }
              }
            >
              {STATUS_OPTIONS.find((o) => o.value === s)!.label}
            </button>
          ))}
        </div>
        {files.isPending &&
          [1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="card"
              style={{
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minHeight: 72,
              }}
            >
              <Skeleton height={14} width="70%" />
              <Skeleton height={12} width="40%" />
            </div>
          ))}
        {shown.map((f) => (
          <Link
            key={f.id}
            to={`/files/${f.id}`}
            className="card"
            style={{
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              color: 'var(--text-primary)',
              minHeight: 72,
            }}
          >
            <span className="row between" style={{ gap: 12 }}>
              <span className="w5 ellipsis">{f.originalName}</span>
              <StatusBadge status={f.status} />
            </span>
            <span className="t12 muted">
              {formatBytes(f.sizeBytes)} · {formatDayMonth(f.createdAt)}
              {all && ` · ${ownerName(f.ownerId)}`}
            </span>
            {f.status === 'FAILED' && f.errorMessage && (
              <span className="t12" style={{ color: 'var(--sev-high-fg)' }}>
                {f.errorMessage}
              </span>
            )}
          </Link>
        ))}
        {empty && <Card>{empty}</Card>}
        <LoadMore
          bare
          hasMore={Boolean(files.hasNextPage)}
          loading={files.isFetchingNextPage}
          onLoad={() => void files.fetchNextPage()}
        />
      </main>
    );
  }

  return (
    <main className="content" id="main">
      <div className="row between wrap" style={{ gap: 16 }}>
        <div className="col" style={{ gap: 4 }}>
          <h1 className="t24">Files</h1>
          <p className="sec">{all ? 'All files in your organization.' : 'Files you uploaded.'}</p>
        </div>
        <ButtonLink to="/upload" variant="primary">
          <Icon name="upload" />
          Upload file
        </ButtonLink>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <SearchInput
          style={{ width: 280 }}
          placeholder="Search by file name"
          aria-label="Search by file name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        {all && (
          <FilterSelect
            label="Owner"
            value={owner}
            onChange={setOwner}
            options={[
              { value: 'anyone', label: 'Anyone' },
              { value: 'me', label: 'Me' },
              { value: 'others', label: 'Others' },
            ]}
          />
        )}
        {filtered && files.hasNextPage && (
          <span className="t12 muted">Filtering the files loaded so far</span>
        )}
      </div>
      <div className="card" style={{ overflow: 'visible', position: 'relative' }}>
        {empty ?? (
          <Table aria-busy={files.isPending}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Size</th>
                <th>Uploaded</th>
                {all && <th>Owner</th>}
                <th style={{ width: 56 }}>
                  <HiddenHeader>Actions</HiddenHeader>
                </th>
              </tr>
            </thead>
            <tbody>
              {files.isPending
                ? [1, 2, 3, 4, 5, 6].map((i) => (
                    <tr key={i}>
                      <td>
                        <Skeleton height={14} width={220} />
                      </td>
                      <td>
                        <Skeleton height={22} width={80} radius={11} />
                      </td>
                      <td>
                        <div style={{ marginLeft: 'auto', width: 56 }}>
                          <Skeleton height={14} width={56} />
                        </div>
                      </td>
                      <td>
                        <Skeleton height={14} width={120} />
                      </td>
                      {all && (
                        <td>
                          <Skeleton height={14} width={100} />
                        </td>
                      )}
                      <td />
                    </tr>
                  ))
                : shown.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <Link
                          to={`/files/${f.id}`}
                          className="col"
                          style={{ gap: 2, color: 'var(--text-primary)' }}
                        >
                          <span className="w5 trunc" title={f.originalName} style={{ maxWidth: 300 }}>
                            {f.originalName}
                          </span>
                          {f.status === 'FAILED' && f.errorMessage && (
                            <span
                              className="t12"
                              style={{ color: 'var(--sev-high-fg)', whiteSpace: 'normal' }}
                            >
                              {f.errorMessage}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={f.status} />
                      </td>
                      <td className="num">{formatBytes(f.sizeBytes)}</td>
                      <td className="sec">{formatDateTime(f.createdAt)}</td>
                      {all && <td className="sec">{ownerName(f.ownerId)}</td>}
                      <td>{rowMenu(f)}</td>
                    </tr>
                  ))}
            </tbody>
          </Table>
        )}
        <LoadMore
          hasMore={Boolean(files.hasNextPage)}
          loading={files.isFetchingNextPage}
          onLoad={() => void files.fetchNextPage()}
        />
      </div>
      <DeleteFileDialog file={deleting} onClose={() => setDeleting(null)} />
    </main>
  );
}
