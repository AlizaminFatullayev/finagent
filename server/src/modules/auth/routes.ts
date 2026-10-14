import { Router } from 'express';
import { z } from 'zod';
import { bearer, envelope, errors, json, registry } from '../../lib/openapi.js';
import { authenticate } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { UserSchema } from '../users/schemas.js';
import * as controller from './controller.js';
import { LoginBody, RefreshBody, TokenPairSchema } from './schemas.js';

export const authRouter = Router();
// Every auth endpoint shares the strict per-IP budget.
authRouter.use(authLimiter);

const body = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } });

registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  tags: ['Auth'],
  summary: 'Log in with email and password',
  description:
    'Returns a 15-minute access token and a single-use refresh token. Repeated failures lock the account temporarily.',
  request: body(LoginBody),
  responses: { 200: json(envelope(TokenPairSchema)), ...errors(401, 422, 429) },
});
authRouter.post('/login', validate({ body: LoginBody }), controller.login);

registry.registerPath({
  method: 'post',
  path: '/api/auth/refresh',
  tags: ['Auth'],
  summary: 'Exchange a refresh token for a new token pair (rotation)',
  request: body(RefreshBody),
  responses: { 200: json(envelope(TokenPairSchema)), ...errors(401, 422, 429) },
});
authRouter.post('/refresh', validate({ body: RefreshBody }), controller.refresh);

registry.registerPath({
  method: 'post',
  path: '/api/auth/logout',
  tags: ['Auth'],
  summary: 'Revoke the session that owns the given refresh token',
  security: bearer,
  request: body(RefreshBody),
  responses: { 200: json(envelope(z.object({ loggedOut: z.literal(true) }))), ...errors(401, 422) },
});
authRouter.post('/logout', authenticate, validate({ body: RefreshBody }), controller.logout);

registry.registerPath({
  method: 'get',
  path: '/api/auth/me',
  tags: ['Auth'],
  summary: 'Current user profile',
  security: bearer,
  responses: { 200: json(envelope(UserSchema)), ...errors(401) },
});
authRouter.get('/me', authenticate, controller.me);
