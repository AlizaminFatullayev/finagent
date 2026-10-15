import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from '../../lib/cx';
import { Icon } from './Icon';

type FieldProps = {
  label: ReactNode;
  error?: string | null;
  /** Error styling without a message (e.g. both login fields after a 401). */
  invalid?: boolean;
  help?: ReactNode;
  className?: string;
};

export function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span className="err" id={id}>
      <Icon name="warning" />
      {children}
    </span>
  );
}

/** Label + input + help or error, wired with ids for screen readers. */
export function TextField({
  label,
  error,
  invalid,
  help,
  className,
  ...input
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hint = `${id}-hint`;
  return (
    <div className={cx('field', className)}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={cx('input', (error || invalid) && 'is-error', input.type === 'url' && 'mono')}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={error || help ? hint : undefined}
        {...input}
      />
      {error ? (
        <FieldError id={hint}>{error}</FieldError>
      ) : (
        help && (
          <span className="help" id={hint}>
            {help}
          </span>
        )
      )}
    </div>
  );
}

/** Password input with the show/hide trailing button from the login design. */
export function PasswordField({
  label,
  error,
  invalid,
  className,
  ...input
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className={cx('field', className)}>
      <div className="row between">
        <label className="label" htmlFor={id}>
          {label}
        </label>
      </div>
      <div className="inwrap">
        <input
          id={id}
          className={cx('input', (error || invalid) && 'is-error')}
          type={shown ? 'text' : 'password'}
          aria-invalid={error || invalid ? true : undefined}
          {...input}
        />
        <button
          type="button"
          className="trail focusable"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
          disabled={input.disabled}
        >
          <Icon name="eye" size={20} />
        </button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

export function SearchInput({ className, ...input }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cx('inwrap', className)}>
      <Icon name="search" className="lead" />
      <input className="input" type="search" {...input} />
    </div>
  );
}

type TextareaProps = FieldProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; maxLength: number; minLength?: number };

/** Textarea with the live `n/max` counter from the reveal dialog. */
export function TextareaField({ label, error, help, className, value, maxLength, ...rest }: TextareaProps) {
  const id = useId();
  return (
    <div className={cx('field', className)}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className={cx('input', error && 'is-error')}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint ${id}-count`}
        {...rest}
      />
      <div className="row between">
        {error ? (
          <span className="err" id={`${id}-hint`}>
            {error}
          </span>
        ) : (
          <span className="help" id={`${id}-hint`}>
            {help}
          </span>
        )}
        <span className="help mono" id={`${id}-count`} aria-live="polite">
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}
