import type { TokenPair, User } from '../api/types';

/** Synthetic test data only. */
export const user = (role: User['role'] = 'ANALYST', id = '00000000-0000-4000-8000-00000000000a'): User => ({
  id,
  email: `${role.toLowerCase()}@bank.test`,
  name: `Test ${role.toLowerCase()}`,
  role,
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
});

export const pair = (n: number, role: User['role'] = 'ANALYST'): TokenPair => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-token-number-${n}-xxxxxxxx`,
  tokenType: 'Bearer',
  expiresIn: '15m',
  user: user(role),
});

export const envelope = (data: unknown, meta: Record<string, unknown> = {}) => ({ data, meta });
