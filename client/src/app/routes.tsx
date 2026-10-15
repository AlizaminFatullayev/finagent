import type { RouteObject } from 'react-router';
import { RequireAuth, RequireRole } from '../auth/guards';
import { AccountPage } from '../features/account/AccountPage';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { AppShell } from './AppShell';
import { NotFoundPage } from './NotFoundPage';

// The design-system page exists only in development; the branch is removed from production bundles.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/design-system',
        lazy: async () => ({ Component: (await import('../dev/DesignSystemPage')).default }),
      },
    ]
  : [];

export const routes: RouteObject[] = [
  ...devRoutes,
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'account', element: <AccountPage /> },
          // Admin pages arrive in a later phase; the gate is already in place for direct URLs.
          { path: 'admin/*', element: <RequireRole roles={['ADMIN']} /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
