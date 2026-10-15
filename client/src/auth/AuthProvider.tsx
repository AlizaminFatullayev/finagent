import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, unwrap } from '../api/client';
import type { Role, User } from '../api/types';
import { clearSession, getRefreshToken, onSession, refreshSession, setSession } from './session';

/** `signedOut` is `anonymous` after an explicit logout (no return path is kept). */
type Status = 'loading' | 'anonymous' | 'signedOut' | 'authenticated' | 'expired';

type AuthValue = {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

/** The signed-in user; only call below a RequireAuth guard. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser without a session');
  return user;
}

export const canSeeAllFiles = (role: Role) => role === 'MANAGER' || role === 'ADMIN';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>(() => (getRefreshToken() ? 'loading' : 'anonymous'));
  const [user, setUser] = useState<User | null>(null);

  useEffect(
    () =>
      onSession((event, pair) => {
        if (event === 'refreshed' && pair) {
          setUser(pair.user);
          setStatus('authenticated');
        }
        if (event === 'expired') {
          // Cached server data (including masked rows) is dropped as soon as the session ends.
          queryClient.clear();
          setStatus('expired');
        }
        if (event === 'cleared') {
          queryClient.clear();
          setUser(null);
          setStatus('signedOut');
        }
      }),
    [queryClient],
  );

  // A reload keeps the refresh token (sessionStorage) but loses the in-memory access token.
  useEffect(() => {
    if (status !== 'loading') return;
    refreshSession()
      .then((pair) => {
        if (!pair) setStatus('anonymous');
      })
      .catch(() => setStatus('anonymous'));
  }, [status]);

  const login = useCallback(async (email: string, password: string) => {
    const pair = await unwrap(api.POST('/api/auth/login', { body: { email, password } }));
    setSession(pair);
    return pair.user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      // Best effort: the local session ends even if the server cannot be reached.
      await api.POST('/api/auth/logout', { body: { refreshToken } }).catch(() => undefined);
    }
    clearSession('cleared');
  }, []);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <AuthContext value={value}>{children}</AuthContext>;
}
