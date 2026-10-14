import { writeFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { generateOpenApiDocument } from '../src/lib/openapi.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { closeQueues } from '../src/queue/queues.js';

// Building the app imports every router, which registers all paths in the OpenAPI registry.
createApp();
const target = new URL('../../docs/openapi.json', import.meta.url);
await writeFile(target, `${JSON.stringify(generateOpenApiDocument(), null, 2)}\n`);
console.log(`OpenAPI document written to ${target.pathname}`);

// Module-level clients were created on import; close them so the script exits.
await closeQueues();
await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
