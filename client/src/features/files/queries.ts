import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, unwrap, unwrapBody } from '../../api/client';
import type { User } from '../../api/types';
import { useUser } from '../../auth/AuthProvider';

export const PAGE_SIZE = 50;

/** Visible files, newest first, cursor pages. */
export function useFiles() {
  return useInfiniteQuery({
    queryKey: ['files'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrapBody(api.GET('/api/files', { params: { query: { limit: PAGE_SIZE, cursor: pageParam } } })),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
}

/** File with sheets and inferred schema. Note: every GET is recorded as `file.view` in the audit log. */
export function useFile(fileId: string) {
  return useQuery({
    queryKey: ['file', fileId],
    queryFn: () => unwrap(api.GET('/api/files/{id}', { params: { path: { id: fileId } } })),
  });
}

/** Analyses of one file, newest first. */
export function useFileAnalyses(fileId: string, limit = 20) {
  return useQuery({
    queryKey: ['analyses', fileId, limit],
    queryFn: () =>
      unwrapBody(api.GET('/api/files/{id}/analyses', { params: { path: { id: fileId }, query: { limit } } })),
  });
}

/**
 * id -> name for owner and actor columns. `GET /api/users` is admin-only, so other roles get an empty
 * map and see "You" or a short id (docs/API_GAPS.md, gap 3).
 */
export function useUserNames() {
  const me = useUser();
  const { data } = useQuery({
    queryKey: ['users', 'names'],
    enabled: me.role === 'ADMIN',
    staleTime: 5 * 60_000,
    queryFn: () => unwrap(api.GET('/api/users', { params: { query: { limit: 100 } } })),
  });
  return (id: string | null): string => {
    if (!id) return 'System';
    if (id === me.id) return 'You';
    return (data as User[] | undefined)?.find((u) => u.id === id)?.name ?? `User ${id.slice(0, 8)}`;
  };
}
