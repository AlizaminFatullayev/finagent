import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cx } from '../../lib/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
type Common = { variant?: Variant; size?: Size; icon?: boolean; className?: string };

export const buttonClass = ({ variant = 'secondary', size = 'md', icon, className }: Common) =>
  cx(
    'btn',
    variant !== 'secondary' && `btn-${variant}`,
    size !== 'md' && `btn-${size}`,
    icon && 'btn-icon',
    className,
  );

type ButtonProps = Common &
  ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; children?: ReactNode };

/** `.btn` from the design: primary / secondary / ghost / danger, sm 32 / md 36 / lg 44, loading spinner. */
export function Button({
  variant,
  size,
  icon,
  loading,
  className,
  children,
  disabled,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={buttonClass({ variant, size, icon, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** A router link styled as a button. */
export function ButtonLink({ variant, size, icon, className, ...rest }: Common & LinkProps) {
  return <Link className={buttonClass({ variant, size, icon, className })} {...rest} />;
}
