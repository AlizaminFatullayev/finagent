import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { usePageHeader } from '../../app/pageHeader';
import { useAuth, useUser } from '../../auth/AuthProvider';
import { RoleBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Controls';
import { Icon } from '../../components/ui/Icon';
import { ADMIN_NAV } from '../../components/shell/Sidebar';
import { initials } from '../../lib/format';
import { currentTheme, saveTheme, type Theme } from '../../lib/theme';

/** Mobile "Account" tab: profile, theme, admin pages (for admins) and sign out. */
export function AccountPage() {
  const user = useUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>(currentTheme);
  usePageHeader([{ label: 'Account' }]);
  return (
    <main className="content" id="main" style={{ maxWidth: 640 }}>
      <div className="card pad16 row" style={{ gap: 12 }}>
        <span className="avatar">{initials(user.name)}</span>
        <div className="col grow" style={{ gap: 2 }}>
          <span className="w5">{user.name}</span>
          <span className="t12 muted ellipsis">{user.email}</span>
        </div>
        <RoleBadge role={user.role} />
      </div>
      <div className="field">
        <span className="label">Theme</span>
        <Segmented
          label="Theme"
          value={theme}
          onChange={(t) => {
            saveTheme(t);
            setTheme(t);
          }}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          className="w-full"
          buttonClassName="grow"
        />
      </div>
      {user.role === 'ADMIN' && (
        <nav className="card" aria-label="Admin">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="row"
              style={{
                gap: 12,
                padding: '0 16px',
                minHeight: 56,
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <Icon name={item.icon} size={20} />
              <span className="grow">{item.label}</span>
              <Icon name="chevronRight" />
            </Link>
          ))}
        </nav>
      )}
      <Button size="lg" onClick={() => void logout().then(() => navigate('/login', { replace: true }))}>
        <Icon name="lock" />
        Sign out
      </Button>
    </main>
  );
}
