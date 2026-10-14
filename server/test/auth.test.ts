import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createUser, loginAs, TEST_PASSWORD } from './factories.js';
import { resetState } from './helpers.js';

const app = createApp();

describe('auth', () => {
  beforeEach(resetState);

  it('logs in, returns a token pair and records auth.login', async () => {
    const user = await createUser('ANALYST');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email.toUpperCase(), password: TEST_PASSWORD })
      .expect(200);
    expect(res.body.data).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: '15m',
      user: { id: user.id, role: 'ANALYST' },
    });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const stored = await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
    // Only the hash is stored, never the token itself.
    expect(stored.tokenHash).not.toBe(res.body.data.refreshToken);
    expect(await prisma.auditLog.count({ where: { action: 'auth.login', actorId: user.id } })).toBe(1);
  });

  it('rejects wrong passwords and unknown emails with the same 401', async () => {
    const user = await createUser();
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'nope' })
      .expect(401);
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'nope' })
      .expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(await prisma.auditLog.count({ where: { action: 'auth.login_failed' } })).toBe(2);
  });

  it('validates the login body with 422 and field details', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' }).expect(422);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ location: 'body', path: 'email' })]),
    );
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);
    }
    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(429);
    expect(locked.body.error.message).toMatch(/locked/);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    const user = await createUser();
    const first = await loginAs(app, user.email);

    const second = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    expect(second.body.data.refreshToken).not.toBe(first.refreshToken);

    // Replaying the rotated token is treated as theft: it fails and kills the newer token too.
    await request(app).post('/api/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: second.body.data.refreshToken })
      .expect(401);
    // Both presentations of a revoked token are recorded as reuse attempts.
    expect(await prisma.auditLog.count({ where: { action: 'auth.refresh_reuse' } })).toBe(2);
  });

  it('returns the profile for a valid token and 401 otherwise', async () => {
    const user = await createUser('MANAGER');
    const { auth } = await loginAs(app, user.email);
    const res = await request(app).get('/api/auth/me').set(auth).expect(200);
    expect(res.body.data).toMatchObject({ id: user.id, role: 'MANAGER' });
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage').expect(401);
  });

  it('rejects tokens of deactivated users immediately', async () => {
    const user = await createUser();
    const { auth } = await loginAs(app, user.email);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await request(app).get('/api/auth/me').set(auth).expect(401);
  });

  it('logout revokes the session and is audited', async () => {
    const user = await createUser();
    const { auth, refreshToken } = await loginAs(app, user.email);
    await request(app).post('/api/auth/logout').set(auth).send({ refreshToken }).expect(200);
    await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(401);
    expect(await prisma.auditLog.count({ where: { action: 'auth.logout', actorId: user.id } })).toBe(1);
  });
});
