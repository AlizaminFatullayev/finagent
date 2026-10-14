import { Router } from 'express';
import { z } from 'zod';
import { send } from '../../lib/http.js';
import { envelope, json, registry } from '../../lib/openapi.js';
import { checkReadiness } from './service.js';

export const healthRouter = Router();

const Liveness = envelope(z.object({ status: z.literal('ok') }));
const Readiness = envelope(
  z.object({ ready: z.boolean(), checks: z.record(z.string(), z.enum(['ok', 'error'])) }),
);

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Liveness probe: the process is up',
  responses: { 200: json(Liveness) },
});
// Liveness never touches dependencies, so a DB outage does not get healthy pods restarted.
healthRouter.get('/health', (_req, res) => send(res, { status: 'ok' }));

registry.registerPath({
  method: 'get',
  path: '/ready',
  tags: ['Health'],
  summary: 'Readiness probe: database and Redis are reachable',
  responses: { 200: json(Readiness), 503: json(Readiness, 'A dependency is down') },
});
healthRouter.get('/ready', async (_req, res) => {
  const result = await checkReadiness();
  send(res, result, { status: result.ready ? 200 : 503 });
});
