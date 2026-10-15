import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TokenChip } from './TokenChip';

describe('TokenChip', () => {
  it('renders a masked token with Show, or a plain label without permission', () => {
    const onShow = vi.fn();
    const { rerender } = render(<TokenChip token="[PERSON_3]" onShow={onShow} />);
    expect(screen.getByText('[PERSON_3]')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Show [PERSON_3]' }).click();
    expect(onShow).toHaveBeenCalled();
    rerender(<TokenChip token="[PERSON_3]" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('toggles selection from the label in table cells', async () => {
    const onToggle = vi.fn();
    render(<TokenChip token="[IBAN_1]" selectable selected onToggle={onToggle} onShow={() => {}} />);
    const label = screen.getByRole('button', { name: 'IBAN_1' });
    expect(label).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(label);
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows the revealed value as text with Hide', () => {
    render(<TokenChip token="[PERSON_3]" value={'<b>Aysel</b>'} onHide={() => {}} />);
    expect(screen.getByText('<b>Aysel</b>')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide [PERSON_3]' })).toBeInTheDocument();
  });
});
