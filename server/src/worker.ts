import { UnrecoverableError, Worker } from 'bullmq';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createRedis, redis } from './lib/redis.js';
import { failAnalysis, isPermanent, processAnalysis } from './queue/processors/analyze.js';
import { processIngest } from './queue/processors/ingest.js';
import { processWebhookDelivery } from './queue/processors/webhookDelivery.js';
import {
  closeQueues,
  QUEUE_NAMES,
  type AnalyzeJob,
  type IngestJob,
  type WebhookJob,
} from './queue/queues.js';
import { publishEvent } from './realtime/events.js';

// Workers hold blocking Redis connections, so each gets its own instead of the shared client.
const ingestWorker = new Worker<IngestJob>(
  QUEUE_NAMES.ingest,
  async (job) => {
    const { fileId, ownerId } = job.data;
    const emit = (percent: number, status = 'PROCESSING') =>
      publishEvent('file:ingest:progress', ownerId, { fileId, stage: 'parsing', percent, status });
    try {
      await processIngest(fileId, async (percent) => {
        await job.updateProgress(percent);
        await emit(percent);
      });
      await emit(100, 'READY');
    } catch (err) {
      // Bad content fails for good; transient errors will be retried, so the UI keeps waiting.
      if (err instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await emit(100, 'FAILED');
      }
      throw err;
    }
  },
  { connection: createRedis(), concurrency: env.QUEUE_CONCURRENCY_INGEST },
);

const analyzeWorker = new Worker<AnalyzeJob>(
  QUEUE_NAMES.analyze,
  async (job) => {
    try {
      await processAnalysis(job.data.analysisId, (stage, percent) => job.updateProgress({ stage, percent }));
    } catch (err) {
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      // Intermediate failures stay RUNNING so the UI does not flash "failed" before a successful retry.
      if (lastAttempt || isPermanent(err)) await failAnalysis(job.data.analysisId, err);
      throw isPermanent(err) ? new UnrecoverableError(err instanceof Error ? err.message : 'failed') : err;
    }
  },
  { connection: createRedis(), concurrency: env.QUEUE_CONCURRENCY_ANALYZE },
);

const webhookWorker = new Worker<WebhookJob>(
  QUEUE_NAMES.webhook,
  (job) => processWebhookDelivery(job.data.deliveryId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1)),
  { connection: createRedis(), concurrency: env.QUEUE_CONCURRENCY_WEBHOOK },
);

const workers = [ingestWorker, analyzeWorker, webhookWorker];

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
