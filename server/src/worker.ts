import { Worker } from 'bullmq';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createRedis, redis } from './lib/redis.js';
import { processIngest } from './queue/processors/ingest.js';
import { closeQueues, QUEUE_NAMES, type IngestJob } from './queue/queues.js';

// Workers hold blocking Redis connections, so each gets its own instead of the shared client.
const workers = [
  new Worker<IngestJob>(
    QUEUE_NAMES.ingest,
    (job) => processIngest(job.data.fileId, (p) => job.updateProgress(p)),
    {
      connection: createRedis(),
      concurrency: env.QUEUE_CONCURRENCY_INGEST,
    },
  ),
];

for (const worker of workers) {
  worker.on('failed', (job, err) => logger.warn({ queue: worker.name, jobId: job?.id, err }, 'job failed'));
}
logger.info({ queues: workers.map((w) => w.name) }, 'worker started');

/** Lets running jobs finish (BullMQ waits for them), then releases connections. */
async function shutdown(signal: string) {
  logger.info({ signal }, 'worker shutting down');
  setTimeout(() => process.exit(1), 30_000).unref();
  await Promise.allSettled(workers.map((w) => w.close()));
  await closeQueues();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
