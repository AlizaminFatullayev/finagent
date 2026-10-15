import type { RouteObject } from 'react-router';
import { RequireAuth, RequireRole } from '../auth/guards';
import { AnalyzeButton } from '../features/analysis/AnalyzeButton';
import { AccountPage } from '../features/account/AccountPage';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { FileDetailPage } from '../features/files/FileDetailPage';
import { FilesPage } from '../features/files/FilesPage';
import { UploadPage } from '../features/upload/UploadPage';
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

// Charts (Recharts) and admin pages load on demand to keep the first bundle small.
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
          { path: 'upload', element: <UploadPage /> },
          { path: 'files', element: <FilesPage /> },
          {
            path: 'files/:fileId',
            element: <FileDetailPage analyzeSlot={(file) => <AnalyzeButton file={file} />} />,
          },
          {
            path: 'analyses/:analysisId',
            lazy: async () => ({
              Component: (await import('../features/analysis/AnalysisPage')).AnalysisPage,
            }),
          },
          {
            path: 'analyses/:analysisId/anomalies',
            lazy: async () => ({
              Component: (await import('../features/analysis/AnomaliesPage')).AnomaliesPage,
            }),
          },
          {
            path: 'analyses/:analysisId/charts',
            lazy: async () => ({ Component: (await import('../features/analysis/ChartsPage')).ChartsPage }),
          },
          {
            path: 'analyses/:analysisId/report',
            lazy: async () => ({ Component: (await import('../features/analysis/ReportPage')).ReportPage }),
          },
          { path: 'account', element: <AccountPage /> },
          // Hidden from navigation for other roles, and blocked here for direct URLs.
          {
            path: 'admin',
            element: <RequireRole roles={['ADMIN']} />,
            children: [
              {
                path: 'users',
                lazy: async () => ({ Component: (await import('../features/admin/UsersPage')).UsersPage }),
              },
              {
                path: 'audit',
                lazy: async () => ({
                  Component: (await import('../features/admin/AuditLogPage')).AuditLogPage,
                }),
              },
              {
                path: 'webhooks',
                lazy: async () => ({
                  Component: (await import('../features/admin/WebhooksPage')).WebhooksPage,
                }),
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
