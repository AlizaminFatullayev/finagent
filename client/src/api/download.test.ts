import { describe, expect, it, vi } from 'vitest';
import { filenameFrom, saveBlob } from './download';

describe('filenameFrom', () => {
  it('reads quoted, plain and RFC 5987 filenames', () => {
    expect(filenameFrom('attachment; filename="finagent-report-1.pdf"', 'x')).toBe('finagent-report-1.pdf');
    expect(filenameFrom('attachment; filename=report.xlsx', 'x')).toBe('report.xlsx');
    expect(filenameFrom("attachment; filename*=UTF-8''hesabat%20%C9%99.pdf", 'x')).toBe('hesabat ə.pdf');
    expect(filenameFrom(null, 'fallback.pdf')).toBe('fallback.pdf');
  });
});

describe('saveBlob', () => {
  it('downloads through a temporary object URL and revokes it', async () => {
    const create = vi.fn(() => 'blob:local/1');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    saveBlob(new Blob(['%PDF']), 'r.pdf');
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(revoke).toHaveBeenCalledWith('blob:local/1');
  });
});
