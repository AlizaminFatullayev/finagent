import { Dialog, DropdownMenu, Tabs as RadixTabs, Tooltip } from 'radix-ui';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '../../lib/cx';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  /** `alertdialog` for destructive confirmations and the session-expired notice. */
  role?: 'dialog' | 'alertdialog';
  /** Block closing by Escape / outside click (busy states, forced re-login). */
  locked?: boolean;
  className?: string;
};

/** Centered dialog: `.overlay > .dialog` with `.dh` / `.db` / `.df`; focus is trapped and returned. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  maxWidth,
  role,
  locked,
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (locked && !o ? undefined : onOpenChange(o))}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay">
          <Dialog.Content
            className={cx('dialog', className)}
            style={maxWidth ? { maxWidth } : undefined}
            role={role}
            onEscapeKeyDown={locked ? (e) => e.preventDefault() : undefined}
            onPointerDownOutside={locked ? (e) => e.preventDefault() : undefined}
          >
            <div className="dh">
              <Dialog.Title className="t20">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="sec">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            {children && <div className="db">{children}</div>}
            {footer && <div className="df">{footer}</div>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Right-hand drawer (`.drawer`) with a header, scrollable body and optional footer. */
export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  badge,
  children,
  footer,
  width = 640,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: 40 }} />
        <Dialog.Content className={cx('drawer', className)} style={{ width: `min(${width}px, 100%)` }}>
          <div
            className="row between"
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-subtle)',
              alignItems: 'flex-start',
            }}
          >
            <div className="col" style={{ gap: 2, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <Dialog.Title className="t20">{title}</Dialog.Title>
                {badge}
              </div>
              <Dialog.Description className={cx('t12 muted ellipsis', !subtitle && 'sr-only')}>
                {subtitle ?? title}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" icon aria-label="Close">
                <Icon name="x" size={20} />
              </Button>
            </Dialog.Close>
          </div>
          {children}
          {footer}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type MenuItem =
  | {
      label: ReactNode;
      icon?: IconName;
      onSelect?: () => void;
      to?: string;
      danger?: boolean;
      hint?: ReactNode;
      lead?: ReactNode;
    }
  | 'separator';

/** Row-action / export menu (`.menu` + `.mi`), keyboard navigable. */
export function Menu({
  trigger,
  items,
  align = 'end',
  width,
}: {
  trigger: ReactElement;
  items: MenuItem[];
  align?: 'start' | 'end';
  width?: number;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align={align} sideOffset={4} style={{ zIndex: 50, width }}>
          {items.map((item, i) => {
            if (item === 'separator')
              return <DropdownMenu.Separator key={i} className="divider" style={{ margin: '4px 0' }} />;
            const body = (
              <>
                {item.lead}
                {item.icon && <Icon name={item.icon} />}
                {item.hint ? (
                  <span className="col">
                    <span>{item.label}</span>
                    <span className="t12 muted">{item.hint}</span>
                  </span>
                ) : (
                  item.label
                )}
              </>
            );
            const style: CSSProperties | undefined = item.hint
              ? { height: 'auto', minHeight: 48 }
              : undefined;
            return (
              <DropdownMenu.Item
                key={i}
                className={cx('mi', item.danger && 'danger')}
                style={style}
                onSelect={item.onSelect}
                asChild={Boolean(item.to)}
              >
                {item.to ? <Link to={item.to}>{body}</Link> : body}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** `.select` trigger with a radio list: "Status: All", "Severity: High", ... */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  icon?: IconName;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="select">
          {icon && <Icon name={icon} />}
          {label}: {current}
          <Icon name="chevronDown" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu"
          align="start"
          sideOffset={4}
          style={{ zIndex: 50, maxHeight: 320, overflowY: 'auto' }}
        >
          <DropdownMenu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
            {options.map((o) => (
              <DropdownMenu.RadioItem key={o.value} value={o.value} className="mi">
                <span className="grow">{o.label}</span>
                <DropdownMenu.ItemIndicator>
                  <Icon name="check" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export const TooltipProvider = Tooltip.Provider;

/** `.tooltip` on hover and focus; for truncated text and failure details. */
export function Tip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6} style={{ zIndex: 55 }}>
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Truncated cell text with the full value in a tooltip and the title attribute. */
export function Trunc({ text, max = 220, className }: { text: string; max?: number; className?: string }) {
  return (
    <Tip content={text}>
      <span className={cx('trunc', className)} style={{ maxWidth: max }} tabIndex={0}>
        {text}
      </span>
    </Tip>
  );
}

/** Sheet tabs (`.tabs` / `.tab`) with optional counts. */
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
  tabStyle,
  children,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: ReactNode; count?: ReactNode }[];
  label: string;
  tabStyle?: CSSProperties;
  /** Content of the active tab. Every panel exists (hidden when inactive) so aria-controls always resolves. */
  children?: ReactNode;
}) {
  return (
    <RadixTabs.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      activationMode="manual"
      style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
    >
      <RadixTabs.List className="tabs" aria-label={label} style={{ overflowX: 'auto' }}>
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            className={cx('tab', t.value === value && 'on')}
            style={tabStyle}
          >
            {t.label}
            {t.count !== undefined && <span className="count">{t.count}</span>}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((t) => (
        <RadixTabs.Content
          key={t.value}
          value={t.value}
          forceMount
          hidden={t.value !== value}
          className="col"
          style={{ gap: 24 }}
        >
          {t.value === value && children}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
