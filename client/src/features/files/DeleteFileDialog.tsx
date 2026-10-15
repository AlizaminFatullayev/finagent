import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../api/client';
import { ApiError } from '../../api/errors';
import type { FileItem } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Overlays';
import { Banner } from '../../components/ui/Surfaces';
import { notify } from '../../components/ui/Toast';

/** Destructive confirmation (FilesDelete.html). Soft delete; owner or admin only. */
export function DeleteFileDialog({
  file,
  onClose,
  onDeleted,
}: {
  file: Pick<FileItem, 'id' | 'originalName'> | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/files/{id}', { params: { path: { id } } })),
    onSuccess: (_d, id) => {
      queryClient.removeQueries({ queryKey: ['file', id] });
      void queryClient.invalidateQueries({ queryKey: ['files'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      notify({ icon: 'check', title: 'File deleted', body: file?.originalName });
      remove.reset();
      onClose();
      onDeleted?.();
    },
  });
  const error = remove.error instanceof ApiError ? remove.error : null;
  return (
    <Modal
      open={file !== null}
      onOpenChange={(o) => !o && !remove.isPending && (remove.reset(), onClose())}
      locked={remove.isPending}
      role="alertdialog"
      maxWidth={440}
      title="Delete this file?"
      description={
        <>
          <b className="w5" style={{ color: 'var(--text-primary)' }}>
            {file?.originalName}
          </b>{' '}
          will be removed, together with its analyses and exported reports. This can’t be undone.
        </>
      }
      footer={
        <>
          <Button variant="ghost" disabled={remove.isPending} onClick={() => (remove.reset(), onClose())}>
            Cancel
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => file && remove.mutate(file.id)}>
            {remove.isPending ? 'Deleting…' : 'Delete file'}
          </Button>
        </>
      }
    >
      {remove.isError && (
        <Banner
          kind="error"
          role="alert"
          title={
            error?.status === 403
              ? 'Only the owner or an admin can delete this file'
              : 'The file wasn’t deleted'
          }
        >
          {error?.status === 403 ? 'Nothing was changed.' : 'Try again in a moment.'}
        </Banner>
      )}
      <p className="t12 muted">The deletion is recorded in the audit log.</p>
    </Modal>
  );
}
