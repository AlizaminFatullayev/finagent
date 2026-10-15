import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import { ToastHost } from '../components/ui/Toast';
import { TooltipProvider } from '../components/ui/Overlays';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// The design-system page exists only in development; the branch is removed from production bundles.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/design-system',
        lazy: async () => ({ Component: (await import('../dev/DesignSystemPage')).default }),
      },
    ]
  : [];

const router = createBrowserRouter([
  ...devRoutes,
  {
    path: '*',
    element: (
      <main className="content">
        <h1 className="t24">FinAgent</h1>
      </main>
    ),
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <RouterProvider router={router} />
        <ToastHost />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
