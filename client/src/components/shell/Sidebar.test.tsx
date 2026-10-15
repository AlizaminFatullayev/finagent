import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Role } from '../../api/types';
import { Sidebar } from './Sidebar';

const renderAs = (role: Role, path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar role={role} collapsed={false} onToggle={() => {}} />
    </MemoryRouter>,
  );

describe('Sidebar', () => {
  it.each<Role>(['ANALYST', 'MANAGER'])('hides the Admin group entirely for %s', (role) => {
    renderAs(role);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Dashboard', 'Files', 'Upload']);
    expect(within(nav).queryByText('Admin')).toBeNull();
  });

  it('shows Users, Audit log and Webhooks for admins', () => {
    renderAs('ADMIN');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Dashboard', 'Files', 'Upload', 'Users', 'Audit log', 'Webhooks']);
  });

  it('marks Files active on file and analysis pages', () => {
    renderAs('ANALYST', '/analyses/abc');
    expect(screen.getByRole('link', { name: 'Files' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });
});
