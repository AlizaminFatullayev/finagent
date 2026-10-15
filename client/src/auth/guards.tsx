import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { ApiError } from '../api/errors';
import type { Role } from '../api/types';
import { ErrorState } from '../components/ErrorState';
import { useAuth } from './AuthProvider';

/** Signed-in area: unauthenticated visitors go to /login and come back afterwards. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return null;
  // After a sign-out the next user starts on the dashboard, not on the previous user's page.
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children ?? <Outlet />;
}

/** Role gate for whole routes (admin pages). Navigation hides them too; this blocks direct URLs. */
export function RequireRole({ roles, children }: { roles: Role[]; children?: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return (
      <main className="content" id="main">
        <ErrorState error={new ApiError(403, 'FORBIDDEN', 'Insufficient role')} />
      </main>
    );
  }
  return children ?? <Outlet />;
}
