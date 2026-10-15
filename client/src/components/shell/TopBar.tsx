import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { User } from '../../api/types';
import { initials } from '../../lib/format';
import type { Theme } from '../../lib/theme';
import { RoleBadge } from '../ui/Badge';
import { Button, ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Menu, type MenuItem } from '../ui/Overlays';

export type Crumb = { label: string; to?: string };

export type LiveNotification = { id: string; title: string; body?: string; to?: string; at: number };

export function TopBar({
  crumbs,
  user,
  theme,
  onToggleTheme,
  notifications,
  unread,
  onOpenNotifications,
  onSignOut,
}: {
  crumbs: Crumb[];
  user: User;
  theme: Theme;
  onToggleTheme: () => void;
  notifications: LiveNotification[];
  unread: number;
  onOpenNotifications: () => void;
  onSignOut: () => void;
}) {
  const current = crumbs.at(-1);
  const bellItems: MenuItem[] = notifications.length
    ? notifications.map((n) => ({ label: n.title, hint: n.body, to: n.to }))
    : [
        {
          label: 'No notifications in this session',
          hint: 'Live events appear here while you are signed in.',
        },
      ];
  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.slice(0, -1).map((c) => (
          <Fragment key={c.label}>
            {c.to ? (
              <Link to={c.to} style={{ color: 'var(--text-muted)' }}>
                {c.label}
              </Link>
            ) : (
              <span>{c.label}</span>
            )}
            <Icon name="chevronRight" />
          </Fragment>
        ))}
        {current && <b aria-current="page">{current.label}</b>}
      </nav>
      <Button
        variant="ghost"
        icon
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={onToggleTheme}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
      </Button>
      <Menu
        width={320}
        items={bellItems}
        trigger={
          <Button
            variant="ghost"
            icon
            aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            style={{ position: 'relative' }}
            onClick={onOpenNotifications}
          >
            <Icon name="bell" size={20} />
            {unread > 0 && <span className="dot" />}
          </Button>
        }
      />
      <Menu
        items={[
          { label: user.email, hint: 'Signed in' },
          'separator',
          { label: 'Sign out', icon: 'lock', onSelect: onSignOut },
        ]}
        trigger={
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="User menu"
            style={{ height: 44, padding: '0 8px', gap: 12 }}
          >
            <span className="avatar">{initials(user.name)}</span>
            <span className="col" style={{ alignItems: 'flex-start', gap: 2 }}>
              <span className="t14 w5" style={{ color: 'var(--text-primary)' }}>
                {user.name}
              </span>
              <RoleBadge role={user.role} />
            </span>
            <Icon name="chevronDown" />
          </button>
        }
      />
    </header>
  );
}

/** Mobile header (`.mbar`): back link or brand mark, page title, one optional action. */
export function MobileBar({ crumbs, action }: { crumbs: Crumb[]; action?: ReactNode }) {
  const back = [...crumbs.slice(0, -1)].reverse().find((c) => c.to);
  return (
    <header className="mbar">
      {back ? (
        <ButtonLink to={back.to!} variant="ghost" icon aria-label={`Back to ${back.label}`}>
          <Icon name="chevronLeft" size={20} />
        </ButtonLink>
      ) : (
        <span className="mark">FA</span>
      )}
      <span className="t16 w6 grow ellipsis">{crumbs.at(-1)?.label}</span>
      {action}
    </header>
  );
}
