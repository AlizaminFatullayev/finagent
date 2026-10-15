import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Icon } from './Icon';

/** Native checkbox (visually hidden) driving the design's `.box`, so keyboard and forms work as usual. */
export function Checkbox({
  checked,
  onChange,
  children,
  className,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cx('check', className)}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={cx(
          'box',
          checked && 'on',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-focus-ring',
        )}
      >
        {checked && <Icon name="check" />}
      </span>
      {children}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx('toggle', checked && 'on')}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
    />
  );
}

/** `.seg` radio group (language, role). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  buttonClassName,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <div
      className={cx('seg', className)}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        // Arrow keys move the selection, as in a native radio group.
        const step =
          e.key === 'ArrowRight' || e.key === 'ArrowDown'
            ? 1
            : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
              ? -1
              : 0;
        if (!step) return;
        e.preventDefault();
        const i = (options.findIndex((o) => o.value === value) + step + options.length) % options.length;
        onChange(options[i]!.value);
        (e.currentTarget.children[i] as HTMLElement | undefined)?.focus();
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={cx(o.value === value && 'on', buttonClassName)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
