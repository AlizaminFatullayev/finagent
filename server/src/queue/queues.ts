import { Queue, type DefaultJobOptions } from 'bullmq';
import { redis } from '../lib/redis.js';

export const QUEUE_NAMES = { ingest: 'ingest', analyze: 'analyze', webhook: 'webhook-delivery' } as const;

export type IngestJob = { fileId: string };

// Transient failures (DB blip, LLM timeout) retry with growing gaps; finished jobs are trimmed
// so Redis memory stays flat, while recent failures are kept for debugging.
export const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
};

export const ingestQueue = new Queue<IngestJob>(QUEUE_NAMES.ingest, { connection: redis, defaultJobOptions });

export async function closeQueues() {
  await Promise.allSettled([ingestQueue.close()]);
}
