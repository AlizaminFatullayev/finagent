import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// One client per process: each instance owns a connection pool.
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
