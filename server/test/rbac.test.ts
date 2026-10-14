import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Role } from '../src/generated/prisma/enums.js';
import { userWithToken } from './factories.js';
import { resetState } from './helpers.js';

const app = createApp();
const roles: Role[] = ['ANALYST', 'MANAGER', 'ADMIN'];
const tokens = {} as Record<Role, Record<string, string>>;

// Each protected route and the roles allowed through its route-level guard.
// Ownership rules (analyst vs. someone else's file) are covered in the module tests.
export const matrix: {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  allowed: Role[];
  body?: object;
}[] = [
  { method: 'get', path: '/api/auth/me', allowed: ['ANALYST', 'MANAGER', 'ADMIN'] },
  { method: 'get', path: '/api/users', allowed: ['ADMIN'] },
  { method: 'post', path: '/api/users', allowed: ['ADMIN'], body: {} },
  {
    method: 'patch',
    path: '/api/users/00000000-0000-4000-8000-000000000000/role',
    allowed: ['ADMIN'],
    body: {},
  },
  { method: 'get', path: '/api/audit-logs', allowed: ['ADMIN'] },
  { method: 'get', path: '/api/files', allowed: ['ANALYST', 'MANAGER', 'ADMIN'] },
  { method: 'post', path: '/api/files', allowed: ['ANALYST', 'MANAGER', 'ADMIN'] },
  { method: 'get', path: '/api/webhooks', allowed: ['ADMIN'] },
  { method: 'post', path: '/api/webhooks', allowed: ['ADMIN'], body: {} },
  { method: 'delete', path: '/api/webhooks/00000000-0000-4000-8000-000000000000', allowed: ['ADMIN'] },
  { method: 'get', path: '/api/analyses/00000000-0000-4000-8000-000000000000', allowed: ['ANALYST', 'MANAGER', 'ADMIN'] },
];

describe('RBAC matrix', () => {
  beforeAll(async () => {
    await resetState();
    for (const role of roles) tokens[role] = (await userWithToken(app, role)).auth;
  });

  for (const route of matrix) {
    it(`${route.method.toUpperCase()} ${route.path} requires a token`, async () => {
      await request(app)[route.method](route.path).send(route.body).expect(401);
    });

    for (const role of roles) {
      const allowed = route.allowed.includes(role);
      it(`${route.method.toUpperCase()} ${route.path} as ${role} is ${allowed ? 'allowed' : 'forbidden'}`, async () => {
        const res = await request(app)[route.method](route.path).set(tokens[role]).send(route.body);
        // Allowed requests may still fail validation (422) or lookup (404), but never with 401/403.
        if (allowed) expect([401, 403]).not.toContain(res.status);
        else expect(res.status).toBe(403);
      });
    }
  }
});
