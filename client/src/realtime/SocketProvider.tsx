import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { AnalysisError } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { API_BASE, getAccessToken, refreshSession } from '../auth/session';
import { progressStore, type AnalysisProgress, type IngestProgress } from './progress';

export type AnalysisFailed = { analysisId: string; fileId: string; error: AnalysisError };
export type AnalysisCompleted = { analysisId: string; fileId: string };

type Events = {
  'file:ingest:progress': IngestProgress;
  'analysis:progress': AnalysisProgress;
  'analysis:completed': AnalysisCompleted;
  'analysis:failed': AnalysisFailed;
};
type Listener<E extends keyof Events> = (payload: Events[E]) => void;

type SocketValue = {
  connected: boolean;
  on: <E extends keyof Events>(event: E, listener: Listener<E>) => () => void;
};

const SocketContext = createContext<SocketValue>({ connected: false, on: () => () => {} });

export const useSocket = () => use(SocketContext);

/** Subscribes to one socket event for the lifetime of the component. */
export function useSocketEvent<E extends keyof Events>(event: E, listener: Listener<E>) {
  const { on } = useSocket();
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => on(event, (p) => ref.current(p)), [on, event]);
}

/**
 * One Socket.IO connection per signed-in session. The handshake carries the in-memory access token
 * (`auth: { token }`), read again on every reconnect so a refreshed token is used; an `unauthorized`
 * rejection triggers one refresh. Disconnects on logout and session expiry. Events update the query
 * cache and the live progress store; screens that wait on progress poll when `connected` is false.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  // Listeners live here, not on the socket, so screens can subscribe before the connection exists.
  const listeners = useRef(new Map<string, Set<(p: unknown) => void>>());
  const dispatch = (event: string, payload: unknown) =>
    listeners.current.get(event)?.forEach((l) => l(payload));

  useEffect(() => {
    if (status !== 'authenticated') return;
    const s = io(API_BASE, {
      path: '/socket.io',
      auth: (cb) => cb({ token: getAccessToken() }),
      reconnectionDelayMax: 10_000,
    });
    let refreshed = false;
    s.on('connect', () => {
      refreshed = false;
      setConnected(true);
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      setConnected(false);
      if (err.message === 'unauthorized' && !refreshed) {
        refreshed = true;
        void refreshSession()
          .then((pair) => pair && s.connect())
          .catch(() => undefined);
      }
    });
    s.on('file:ingest:progress', (p: IngestProgress) => {
      progressStore.file(p);
      if (p.status !== 'PROCESSING') {
        void queryClient.invalidateQueries({ queryKey: ['files'] });
        void queryClient.invalidateQueries({ queryKey: ['file', p.fileId] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
      dispatch('file:ingest:progress', p);
    });
    s.on('analysis:progress', (p: AnalysisProgress) => {
      progressStore.analysis(p);
      dispatch('analysis:progress', p);
    });
    for (const event of ['analysis:completed', 'analysis:failed'] as const) {
      s.on(event, (p: AnalysisCompleted) => {
        void queryClient.invalidateQueries({ queryKey: ['analysis', p.analysisId] });
        void queryClient.invalidateQueries({ queryKey: ['analyses', p.fileId] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        dispatch(event, p);
      });
    }
    return () => {
      s.disconnect();
      setConnected(false);
      progressStore.reset();
    };
  }, [status, queryClient]);

  const value = useMemo<SocketValue>(
    () => ({
      connected,
      on: (event, listener) => {
        const set = listeners.current.get(event) ?? new Set();
        set.add(listener as (p: unknown) => void);
        listeners.current.set(event, set);
        return () => void set.delete(listener as (p: unknown) => void);
      },
    }),
    [connected],
  );
  return <SocketContext value={value}>{children}</SocketContext>;
}
