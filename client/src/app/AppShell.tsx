import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import type { FileItem } from '../api/types';
import { useAuth, useUser } from '../auth/AuthProvider';
import { MobileTabs, Sidebar } from '../components/shell/Sidebar';
import { MobileBar, TopBar, type Crumb, type LiveNotification } from '../components/shell/TopBar';
import { notify } from '../components/ui/Toast';
import { currentTheme, saveTheme } from '../lib/theme';
import { useSocketEvent } from '../realtime/SocketProvider';
import { PageHeaderContext } from './pageHeader';
import { SessionExpired } from './SessionExpired';

const COLLAPSE_KEY = 'finagent.sidebar';

/** File name from anything already cached; avoids an extra (audited) GET just for a toast. */
function cachedFileName(queryClient: QueryClient, fileId: string): string {
  for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: ['files'] })) {
    const pages = (data as { pages?: { data: FileItem[] }[] } | undefined)?.pages ?? [];
    const hit = pages.flatMap((p) => p.data).find((f) => f.id === fileId);
    if (hit) return hit.originalName;
  }
  const detail = queryClient.getQueryData<{ originalName: string }>(['file', fileId]);
  return detail?.originalName ?? 'Your file';
}

/** Signed-in layout: sidebar + top bar on desktop, header + bottom tabs below 760px. */
export function AppShell() {
  const user = useUser();
  const { logout, status } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const [header, setHeader] = useState<{ crumbs: Crumb[]; mobileAction?: ReactNode }>({ crumbs: [] });
  const [theme, setTheme] = useState(currentTheme);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const push = useCallback((n: Omit<LiveNotification, 'at'>) => {
    setNotifications((list) => [{ ...n, at: Date.now() }, ...list.filter((x) => x.id !== n.id)].slice(0, 10));
    setUnread((u) => u + 1);
  }, []);

  useSocketEvent('analysis:completed', ({ analysisId, fileId }) => {
    const name = cachedFileName(queryClient, fileId);
    const to = `/analyses/${analysisId}`;
    push({ id: `done-${analysisId}`, title: 'Analysis completed', body: name, to });
    // The progress page navigates to the result by itself.
    if (pathname !== to) {
      notify({
        icon: 'check',
        title: 'Analysis completed',
        body: name,
        action: (
          <Link to={to} className="t12 w5">
            Open result
          </Link>
        ),
      });
    }
  });
  useSocketEvent('analysis:failed', ({ analysisId, fileId }) => {
    const name = cachedFileName(queryClient, fileId);
    const to = `/analyses/${analysisId}`;
    push({
      id: `fail-${analysisId}`,
      title: 'Analysis failed',
      body: `${name} · the file is still available`,
      to,
    });
    if (pathname !== to) {
      notify({
        icon: 'alert',
        error: true,
        title: 'Analysis failed',
        body: `${name} · the file is still available`,
        action: (
          <Link to={to} className="t12 w5">
            See details
          </Link>
        ),
      });
    }
  });
  useSocketEvent('file:ingest:progress', ({ fileId, status }) => {
    if (status === 'PROCESSING') return;
    const name = cachedFileName(queryClient, fileId);
    const to = `/files/${fileId}`;
    const ok = status === 'READY';
    push({
      id: `file-${fileId}`,
      title: ok ? 'File processed' : 'File couldn’t be processed',
      body: name,
      to,
    });
    if (!pathname.startsWith('/upload') && pathname !== to) {
      notify({
        icon: ok ? 'file' : 'alert',
        error: !ok,
        title: ok ? 'File processed' : 'File couldn’t be processed',
        body: name,
        action: (
          <Link to={to} className="t12 w5">
            Open file
          </Link>
        ),
      });
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // Preference only.
      }
      return !c;
    });
  };

  return (
    <PageHeaderContext value={setHeader}>
      <a className="skip btn btn-primary" href="#main">
        Skip to content
      </a>
      <div className="app">
        <Sidebar role={user.role} collapsed={collapsed} onToggle={toggleCollapsed} />
        <div className="main">
          <TopBar
            crumbs={header.crumbs}
            user={user}
            theme={theme}
            onToggleTheme={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              saveTheme(next);
              setTheme(next);
            }}
            notifications={notifications}
            unread={unread}
            onOpenNotifications={() => setUnread(0)}
            onSignOut={() => void logout().then(() => navigate('/login', { replace: true }))}
          />
          <MobileBar crumbs={header.crumbs} action={header.mobileAction} />
          <Outlet />
        </div>
      </div>
      <MobileTabs />
      <SessionExpired open={status === 'expired'} />
    </PageHeaderContext>
  );
}
