import type { RouteObject } from 'react-router';
import { RequireAuth, RequireRole } from '../auth/guards';
import { AnalysisPage } from '../features/analysis/AnalysisPage';
import { AnalyzeButton } from '../features/analysis/AnalyzeButton';
import { AnomaliesPage } from '../features/analysis/AnomaliesPage';
import { ChartsPage } from '../features/analysis/ChartsPage';
import { ReportPage } from '../features/analysis/ReportPage';
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
          { path: 'analyses/:analysisId', element: <AnalysisPage /> },
          { path: 'analyses/:analysisId/anomalies', element: <AnomaliesPage /> },
          { path: 'analyses/:analysisId/charts', element: <ChartsPage /> },
          { path: 'analyses/:analysisId/report', element: <ReportPage /> },
          { path: 'account', element: <AccountPage /> },
          // Admin pages arrive in a later phase; the gate is already in place for direct URLs.
          { path: 'admin/*', element: <RequireRole roles={['ADMIN']} /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
