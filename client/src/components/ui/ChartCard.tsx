import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import { Skeleton } from './Surfaces';

/** Chart frame from Charts.html: group label, title, bucket tag, expand, body and a note row. */
export function ChartCard({
  group,
  title,
  bucket,
  note,
  onExpand,
  loading,
  children,
}: {
  group?: string;
  title: string;
  bucket?: string;
  note?: ReactNode;
  onExpand?: () => void;
  loading?: boolean;
  children?: ReactNode;
}) {
  if (loading) {
    return (
      <section className="card pad col" style={{ gap: 12 }} aria-busy="true">
        <Skeleton height={16} width={160} />
        <div className="row" style={{ alignItems: 'flex-end', gap: 8, height: 180 }}>
          {[40, 60, 52, 75, 68, 82, 70, 90, 78, 95].map((h, i) => (
            <div key={i} className="sk" style={{ flex: 1, height: `${h}%` }} />
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="card pad chart" style={{ gap: 16 }} aria-label={title}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div className="col" style={{ gap: 2, minWidth: 0 }}>
          {group && <span className="over">{group}</span>}
          <h2 className="t16 w6">{title}</h2>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {bucket && <span className="tag">{bucket}</span>}
          {onExpand && (
            <Button variant="ghost" size="sm" icon aria-label={`Expand ${title}`} onClick={onExpand}>
              <Icon name="expand" />
            </Button>
          )}
        </div>
      </div>
      {children}
      {note && (
        <div
          className="row t12 muted"
          style={{
            gap: 8,
            paddingTop: 12,
            borderTop: '1px solid var(--border-subtle)',
            alignItems: 'flex-start',
          }}
        >
          <Icon name="info" style={{ marginTop: 2 }} />
          <span>{note}</span>
        </div>
      )}
    </section>
  );
}
