import argon2 from 'argon2';
import request from 'supertest';
import type { Express } from 'express';
import type { Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';

export const TEST_PASSWORD = 'Correct-Horse-9!';

let counter = 0;

export async function createUser(role: Role = 'ANALYST', overrides: { email?: string } = {}) {
  counter += 1;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase()}${counter}@test.local`,
      name: `${role} ${counter}`,
      role,
      passwordHash: await argon2.hash(TEST_PASSWORD),
    },
  });
}

/** Logs a user in through the real endpoint and returns ready-to-use auth headers. */
export async function loginAs(app: Express, email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD }).expect(200);
  return {
    accessToken: res.body.data.accessToken as string,
    refreshToken: res.body.data.refreshToken as string,
    auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
  };
}

export async function userWithToken(app: Express, role: Role = 'ANALYST') {
  const user = await createUser(role);
  return { user, ...(await loginAs(app, user.email)) };
}
