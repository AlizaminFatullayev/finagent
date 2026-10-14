import { Router } from 'express';
import { z } from 'zod';
import { bearer, envelope, errors, json, registry } from '../../lib/openapi.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  ChangeRoleBody,
  CreateUserBody,
  ListUsersQuery,
  UserIdParams,
  UserListMeta,
  UserSchema,
} from './schemas.js';

export const usersRouter = Router();
// No self-registration: accounts are provisioned by admins only.
usersRouter.use(authenticate, requireRole('ADMIN'));

registry.registerPath({
  method: 'post',
  path: '/api/users',
  tags: ['Users'],
  summary: 'Create a user (admin)',
  security: bearer,
  request: { body: { content: { 'application/json': { schema: CreateUserBody } } } },
  responses: { 201: json(envelope(UserSchema), 'Created'), ...errors(401, 403, 409, 422) },
});
usersRouter.post('/', validate({ body: CreateUserBody }), controller.create);

registry.registerPath({
  method: 'get',
  path: '/api/users',
  tags: ['Users'],
  summary: 'List users, newest first (admin, cursor pagination)',
  security: bearer,
  request: { query: ListUsersQuery },
  responses: { 200: json(envelope(z.array(UserSchema), UserListMeta)), ...errors(401, 403, 422) },
});
usersRouter.get('/', validate({ query: ListUsersQuery }), controller.list);

registry.registerPath({
  method: 'patch',
  path: '/api/users/{id}/role',
  tags: ['Users'],
  summary: "Change a user's role (admin)",
  security: bearer,
  request: { params: UserIdParams, body: { content: { 'application/json': { schema: ChangeRoleBody } } } },
  responses: { 200: json(envelope(UserSchema)), ...errors(401, 403, 404, 409, 422) },
});
usersRouter.patch(
  '/:id/role',
  validate({ params: UserIdParams, body: ChangeRoleBody }),
  controller.changeRole,
);
