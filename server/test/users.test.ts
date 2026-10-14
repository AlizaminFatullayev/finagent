import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createUser, userWithToken } from './factories.js';
import { resetState } from './helpers.js';

const app = createApp();

describe('users and audit (admin)', () => {
  beforeEach(resetState);

  it('creates a user, enforces the password policy and rejects duplicates', async () => {
    const { auth, user: admin } = await userWithToken(app, 'ADMIN');
    const body = { email: 'New.Analyst@Bank.az', name: 'New Analyst', password: 'Str0ng-Passphrase!' };

    const created = await request(app).post('/api/users').set(auth).send(body).expect(201);
    expect(created.body.data).toMatchObject({ email: 'new.analyst@bank.az', role: 'ANALYST' });

    await request(app).post('/api/users').set(auth).send(body).expect(409);
    const weak = await request(app)
      .post('/api/users')
      .set(auth)
      .send({ ...body, email: 'x@bank.az', password: 'short' })
      .expect(422);
    expect(weak.body.error.details[0].path).toBe('password');

    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.create' } });
    expect(entry).toMatchObject({ actorId: admin.id, resourceId: created.body.data.id });
  });

  it('changes roles with an audit trail but not for oneself', async () => {
    const { auth, user: admin } = await userWithToken(app, 'ADMIN');
    const target = await createUser('ANALYST');
    const res = await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set(auth)
      .send({ role: 'MANAGER' })
      .expect(200);
    expect(res.body.data.role).toBe('MANAGER');
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.role_change' } });
    expect(entry.metadata).toEqual({ from: 'ANALYST', to: 'MANAGER' });

    await request(app).patch(`/api/users/${admin.id}/role`).set(auth).send({ role: 'ANALYST' }).expect(409);
    await request(app)
      .patch(`/api/users/00000000-0000-4000-8000-000000000000/role`)
      .set(auth)
      .send({ role: 'ADMIN' })
      .expect(404);
  });

  it('paginates users with a cursor', async () => {
    const { auth } = await userWithToken(app, 'ADMIN');
    for (let i = 0; i < 4; i++) await createUser();
    const page1 = await request(app).get('/api/users?limit=3').set(auth).expect(200);
    expect(page1.body.data).toHaveLength(3);
    const page2 = await request(app)
      .get(`/api/users?limit=3&cursor=${page1.body.meta.nextCursor}`)
      .set(auth)
      .expect(200);
    expect(page2.body.data).toHaveLength(2);
    expect(page2.body.meta.nextCursor).toBeNull();
    const ids = [...page1.body.data, ...page2.body.data].map((u: { id: string }) => u.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('filters audit logs and keeps them append-only at the database level', async () => {
    const { auth } = await userWithToken(app, 'ADMIN');
    await request(app).post('/api/auth/login').send({ email: 'ghost@test.local', password: 'x' }).expect(401);
    const res = await request(app).get('/api/audit-logs?action=auth.login_failed').set(auth).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].metadata).toMatchObject({ email: 'ghost@test.local' });

    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });
});
