import { z } from 'zod';
import { UserSchema } from '../users/schemas.js';

export const LoginBody = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  // No policy check on login: it would leak the policy and reject legacy passwords.
  password: z.string().min(1).max(128),
});

export const RefreshBody = z.object({ refreshToken: z.string().min(20).max(200) });

export const TokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string().meta({ description: 'Single-use; every refresh returns a new one' }),
    tokenType: z.literal('Bearer'),
    expiresIn: z.string().meta({ example: '15m' }),
    user: UserSchema,
  })
  .meta({ id: 'TokenPair' });
