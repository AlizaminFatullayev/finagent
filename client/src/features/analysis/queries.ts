import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '../../api/client';
import type { Analysis } from '../../api/types';
import { useSocket } from '../../realtime/SocketProvider';

const done = (a: Analysis | undefined) => a?.status === 'COMPLETED' || a?.status === 'FAILED';

/**
 * One analysis. While it runs, the socket invalidates it on completion; without a socket it is polled
 * with backoff (2 s, growing to 15 s).
 */
export function useAnalysis(analysisId: string) {
  const { connected } = useSocket();
  return useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: () => unwrap(api.GET('/api/analyses/{id}', { params: { path: { id: analysisId } } })),
    refetchInterval: (q) => {
      if (done(q.state.data)) return false;
      if (connected) return 30_000;
      return Math.min(15_000, 2_000 * 1.5 ** Math.min(q.state.dataUpdateCount, 6));
    },
  });
}

export function useCharts(analysisId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['charts', analysisId],
    enabled,
    staleTime: Infinity,
    queryFn: () => unwrap(api.GET('/api/analyses/{id}/charts', { params: { path: { id: analysisId } } })),
  });
}
