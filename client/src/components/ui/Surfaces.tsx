import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Icon, type IconName } from './Icon';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('card', className)} {...rest} />;
}

/** `.stat` card: label, mono value, context line. */
export function StatCard({
  label,
  value,
  unit,
  context,
  compact,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  context?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="card stat" style={compact ? { padding: '16px 20px' } : undefined}>
      <span className="t12 sec">{label}</span>
      <span className="v" style={compact ? { fontSize: 22, lineHeight: '28px' } : undefined}>
        {value}
        {unit && (
          <span
            className="t12 muted"
            style={{ fontFamily: 'var(--font-ui)', letterSpacing: 0, marginLeft: 4 }}
          >
            {unit}
          </span>
        )}
      </span>
      {context && <span className="t12 muted">{context}</span>}
    </div>
  );
}

type BannerKind = 'info' | 'warn' | 'error' | 'ok';
const BANNER_ICON: Record<BannerKind, IconName> = {
  info: 'info',
  warn: 'warning',
  error: 'alert',
  ok: 'check',
};

/** Inline notice: info / warn / error / ok, optional detail line and action. */
export function Banner({
  kind,
  title,
  children,
  icon,
  action,
  className,
  role,
}: {
  kind: BannerKind;
  title: ReactNode;
  children?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}) {
  return (
    <div className={cx('banner', kind, className)} role={role}>
      <Icon name={icon ?? BANNER_ICON[kind]} className="ic" />
      <div className="col grow" style={{ gap: 4 }}>
        <span className="w5">{title}</span>
        {children && <span className="t12 sec">{children}</span>}
      </div>
      {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  large,
  tone,
  code,
}: {
  icon: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  large?: boolean;
  tone?: 'success';
  code?: string;
}) {
  const H = large ? 'h2' : 'span';
  return (
    <div className="empty" style={large ? { padding: '96px 24px' } : undefined}>
      <div
        className="ei"
        style={
          tone === 'success'
            ? {
                background: 'var(--success-bg)',
                color: 'var(--success-fg)',
                borderColor: 'var(--success-border)',
              }
            : undefined
        }
      >
        <Icon name={icon} size={20} />
      </div>
      {code && <span className="mono muted">{code}</span>}
      <H className={large || code ? 't20' : 't16 w6'}>{title}</H>
      {children && (
        <p className="sec" style={{ maxWidth: 460 }}>
          {children}
        </p>
      )}
      {action}
    </div>
  );
}

export function Skeleton({
  width,
  height,
  radius,
}: {
  width?: number | string;
  height: number;
  radius?: number;
}) {
  return <div className="sk" style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function StatSkeleton() {
  return (
    <div className="card stat" aria-hidden="true">
      <Skeleton height={12} width="50%" />
      <Skeleton height={28} width="40%" />
      <Skeleton height={12} width="70%" />
    </div>
  );
}

/** Horizontal progress bar (`.bar`). */
export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className="bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
    >
      <i style={{ width: `${value}%` }} />
    </div>
  );
}
