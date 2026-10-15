import { Link, useLocation } from 'react-router';
import type { Role } from '../../api/types';
import { cx } from '../../lib/cx';
import { Icon, type IconName } from '../ui/Icon';

type Item = { to: string; label: string; icon: IconName; match: (path: string) => boolean };

export const MAIN_NAV: Item[] = [
  { to: '/', label: 'Dashboard', icon: 'grid', match: (p) => p === '/' },
  {
    to: '/files',
    label: 'Files',
    icon: 'file',
    match: (p) => p.startsWith('/files') || p.startsWith('/analyses'),
  },
  { to: '/upload', label: 'Upload', icon: 'upload', match: (p) => p.startsWith('/upload') },
];

export const ADMIN_NAV: Item[] = [
  { to: '/admin/users', label: 'Users', icon: 'users', match: (p) => p.startsWith('/admin/users') },
  { to: '/admin/audit', label: 'Audit log', icon: 'list', match: (p) => p.startsWith('/admin/audit') },
  { to: '/admin/webhooks', label: 'Webhooks', icon: 'link', match: (p) => p.startsWith('/admin/webhooks') },
];

/** Role-aware sidebar: the Admin group is rendered only for admins (hidden, not disabled). */
export function Sidebar({
  role,
  collapsed,
  onToggle,
}: {
  role: Role;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { pathname } = useLocation();
  const link = (item: Item) => {
    const active = item.match(pathname);
    return (
      <Link
        key={item.to}
        to={item.to}
        className={cx('nav focusable', active && 'active')}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
      >
        <Icon name={item.icon} size={20} />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  };
  return (
    <nav className={cx('side', collapsed && 'collapsed')} aria-label="Main">
      <div className="brand">
        <span className="mark">FA</span>
        {!collapsed && <span>FinAgent</span>}
      </div>
      {MAIN_NAV.map(link)}
      {role === 'ADMIN' && (
        <>
          {!collapsed && <div className="navgroup over">Admin</div>}
          {collapsed && <div className="divider" style={{ margin: '12px 0', width: 32 }} role="separator" />}
          {ADMIN_NAV.map(link)}
        </>
      )}
      <div style={{ flex: '1 1 0%' }} />
      <button
        type="button"
        className="nav"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        onClick={onToggle}
        style={{ border: 0, background: 'transparent', cursor: 'pointer', font: '500 14px var(--font-ui)' }}
      >
        <Icon name="panel" size={20} />
        {!collapsed && <span>Collapse</span>}
      </button>
    </nav>
  );
}

/** Bottom tabs below 760px (design: mobile frames). Admin pages are reached from Account. */
export function MobileTabs() {
  const { pathname } = useLocation();
  const tabs: Item[] = [
    ...MAIN_NAV,
    {
      to: '/account',
      label: 'Account',
      icon: 'user',
      match: (p) => p.startsWith('/account') || p.startsWith('/admin'),
    },
  ];
  return (
    <nav className="mtabs" aria-label="Main">
      {tabs.map((t) => {
        const on = t.match(pathname);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cx('mtab', on && 'on')}
            aria-current={on ? 'page' : undefined}
          >
            <Icon name={t.icon} size={20} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
