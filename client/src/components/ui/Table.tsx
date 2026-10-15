import type { CSSProperties, ReactNode, TableHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { Button } from './Button';

/** Semantic table with the design's horizontal scroll wrapper; first column sticks with `th/td.sticky`. */
export function Table({
  dense,
  className,
  wrapStyle,
  children,
  ...rest
}: TableHTMLAttributes<HTMLTableElement> & { dense?: boolean; wrapStyle?: CSSProperties }) {
  return (
    <div className="tblwrap" style={wrapStyle}>
      <table className={cx('tbl', dense && 'dense', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

/** Visually hidden column header (actions / expand columns). */
export const HiddenHeader = ({ children }: { children: ReactNode }) => (
  <span className="sr-only">{children}</span>
);

/** Cursor pagination: "Load more", never page numbers. Hidden when there is no next page. */
export function LoadMore({
  hasMore,
  loading,
  onLoad,
  bare,
}: {
  hasMore: boolean;
  loading?: boolean;
  onLoad: () => void;
  bare?: boolean;
}) {
  if (!hasMore) return null;
  const button = (
    <Button loading={loading} onClick={onLoad} style={bare ? { width: '100%' } : undefined}>
      Load more
    </Button>
  );
  return bare ? button : <div className="loadmore">{button}</div>;
}
