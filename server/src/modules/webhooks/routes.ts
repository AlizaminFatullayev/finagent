import { Router } from 'express';
import { z } from 'zod';
import { PageMeta, PaginationQuery } from '../../lib/pagination.js';
import { bearer, envelope, errors, json, registry } from '../../lib/openapi.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import { CreatedWebhookSchema, CreateWebhookBody, WebhookIdParams, WebhookSchema } from './schemas.js';

export const webhooksRouter = Router();
webhooksRouter.use(authenticate, requireRole('ADMIN'));

registry.registerPath({
  method: 'post',
  path: '/api/webhooks',
  tags: ['Webhooks'],
  summary: 'Subscribe a URL to analysis events (admin)',
  description:
    'Deliveries are POSTed with `X-FinAgent-Signature: sha256=HMAC(secret, "<timestamp>.<body>")` and `X-FinAgent-Timestamp`. URLs that resolve to private, loopback or link-local addresses are rejected; https is required in production.',
  security: bearer,
  request: { body: { content: { 'application/json': { schema: CreateWebhookBody } } } },
  responses: { 201: json(envelope(CreatedWebhookSchema), 'Created'), ...errors(401, 403, 422) },
});
webhooksRouter.post('/', validate({ body: CreateWebhookBody }), controller.create);

registry.registerPath({
  method: 'get',
  path: '/api/webhooks',
  tags: ['Webhooks'],
  summary: 'List webhooks (admin)',
  security: bearer,
  request: { query: PaginationQuery },
  responses: { 200: json(envelope(z.array(WebhookSchema), PageMeta)), ...errors(401, 403, 422) },
});
webhooksRouter.get('/', validate({ query: PaginationQuery }), controller.list);

registry.registerPath({
  method: 'delete',
  path: '/api/webhooks/{id}',
  tags: ['Webhooks'],
  summary: 'Delete a webhook (admin)',
  security: bearer,
  request: { params: WebhookIdParams },
  responses: { 200: json(envelope(z.object({ deleted: z.literal(true) }))), ...errors(401, 403, 404, 422) },
});
webhooksRouter.delete('/:id', validate({ params: WebhookIdParams }), controller.remove);
