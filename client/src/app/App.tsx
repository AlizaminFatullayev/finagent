import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ApiError } from '../api/errors';
import { AuthProvider } from '../auth/AuthProvider';
import { TooltipProvider } from '../components/ui/Overlays';
import { ToastHost } from '../components/ui/Toast';
import { SocketProvider } from '../realtime/SocketProvider';
import { routes } from './routes';

// Client errors (4xx) are final; only network and server errors are retried, once.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500),
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          <TooltipProvider delayDuration={300}>
            <RouterProvider router={router} />
            <ToastHost />
          </TooltipProvider>
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
