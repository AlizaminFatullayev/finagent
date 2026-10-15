import type { CSSProperties } from 'react';
import { cx } from '../../lib/cx';
import { tokenLabel } from '../../lib/tokens';
import { Icon } from './Icon';

export type TokenChipProps = {
  token: string;
  /** The original value, only while revealed. Rendered as text, never stored. */
  value?: string;
  selected?: boolean;
  /** Table cells: the label itself toggles selection for "Reveal selected". */
  selectable?: boolean;
  notFound?: boolean;
  /** Show the eye icon on the Show button (design: masked state in the component sheet). */
  showIcon?: boolean;
  onShow?: () => void;
  onHide?: () => void;
  onToggle?: () => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * Masked PII chip. Masked: dashed border, mono label, Show. Selected: solid accent. Revealed: solid amber
 * edge, UI font, Hide. Without handlers it renders as a plain label (no reveal permission, dialogs).
 */
export function TokenChip({
  token,
  value,
  selected,
  selectable,
  notFound,
  showIcon,
  onShow,
  onHide,
  onToggle,
  className,
  style,
}: TokenChipProps) {
  const label = selectable ? tokenLabel(token) : token;
  if (value !== undefined) {
    return (
      <span className={cx('tok rev', className)} style={style}>
        <span>{value}</span>
        {onHide && (
          <button type="button" onClick={onHide} aria-label={`Hide ${label}`}>
            Hide
          </button>
        )}
      </span>
    );
  }
  if (notFound) {
    return (
      <span
        className={cx('tok', className)}
        style={{ paddingRight: 6, ...style }}
        title="Not found in this file"
      >
        <s>{label}</s>
      </span>
    );
  }
  const interactive = Boolean(onShow);
  return (
    <span
      className={cx('tok', selected && 'sel', className)}
      style={interactive ? style : { paddingRight: 6, ...style }}
    >
      {selectable && onToggle ? (
        <button type="button" className="tl" aria-pressed={Boolean(selected)} onClick={onToggle}>
          {label}
        </button>
      ) : (
        label
      )}
      {interactive && (
        <button type="button" onClick={onShow} aria-label={`Show ${label}`}>
          {showIcon && <Icon name="eye" />}
          Show
        </button>
      )}
    </span>
  );
}
