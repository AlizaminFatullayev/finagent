import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dropzone, dropzoneView, ERROR_VARIANTS, type DropzoneVariant } from './Dropzone';

describe('dropzoneView', () => {
  it.each<[DropzoneVariant, string, string]>([
    ['idle', 'drop', 'upload'],
    ['over', 'drop over', 'download'],
    ['uploading', 'drop', 'fileicon'],
    ['parsing', 'drop', 'fileicon'],
    ['success', 'drop', 'check'],
    ['duplicate', 'drop', 'copy'],
    ['wrongFormat', 'drop bad', 'warning'],
    ['corrupted', 'drop bad', 'warning'],
    ['tooLarge', 'drop bad', 'warning'],
    ['limits', 'drop bad', 'warning'],
  ])('%s -> "%s" with %s', (variant, className, icon) => {
    expect(dropzoneView(variant)).toEqual({ className, icon });
  });
});

describe('Dropzone', () => {
  it('shows the design copy for every error variant and lets the user pick another file', () => {
    for (const v of ERROR_VARIANTS) {
      const { unmount } = render(<Dropzone variant={v} onFile={() => {}} />);
      expect(screen.getByRole('alert')).toHaveTextContent(
        /isn’t supported|can’t be read|too large|Too many sheets/,
      );
      expect(screen.getByRole('button', { name: 'Choose another file' })).toBeInTheDocument();
      unmount();
    }
  });

  it('switches to the drag-over state and hands the dropped file over', () => {
    const onFile = vi.fn();
    const { container } = render(<Dropzone variant="idle" onFile={onFile} />);
    const zone = container.querySelector('.drop')!;
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } });
    expect(zone).toHaveClass('over');
    expect(screen.getByText('Drop to upload')).toBeInTheDocument();
    const file = new File(['a,b'], 'q3.csv', { type: 'text/csv' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
    expect(zone).not.toHaveClass('over');
  });

  it('accepts a file from the keyboard-reachable picker', async () => {
    const onFile = vi.fn();
    const { container } = render(<Dropzone variant="idle" onFile={onFile} />);
    const file = new File(['x'], 'book.xlsx');
    await userEvent.upload(container.querySelector('input[type=file]') as HTMLInputElement, file);
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('ignores drops while a file is uploading', () => {
    const onFile = vi.fn();
    const { container } = render(
      <Dropzone variant="uploading" onFile={onFile} fileName="a.xlsx" percent={40} />,
    );
    fireEvent.drop(container.querySelector('.drop')!, {
      dataTransfer: { files: [new File(['x'], 'b.xlsx')] },
    });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });
});
