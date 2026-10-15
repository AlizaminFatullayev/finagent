import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Role } from '../api/types';
import { routes } from '../app/routes';
import { user } from '../test/fixtures';
import { AuthContext } from './AuthProvider';

function renderAt(path: string, role: Role | null) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext
        value={{
          status: role ? 'authenticated' : 'anonymous',
          user: role ? user(role) : null,
          login: async () => user(),
          logout: async () => {},
        }}
      >
        <RouterProvider router={router} />
      </AuthContext>
    </QueryClientProvider>,
  );
  return router;
}

describe('route guards', () => {
  it('sends anonymous visitors to the login page', () => {
    const router = renderAt('/files', null);
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it.each<Role>(['ANALYST', 'MANAGER'])(
    'blocks admin pages for %s with a 403 screen and no admin navigation',
    async (role) => {
      renderAt('/admin/users', role);
      expect(await screen.findByText('You don’t have access to this')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
    },
  );

  it('lets admins through', async () => {
    renderAt('/admin/users', 'ADMIN');
    expect((await screen.findAllByRole('link', { name: 'Users' })).length).toBeGreaterThan(0);
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(screen.queryByText('You don’t have access to this')).toBeNull();
  });
});
