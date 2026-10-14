import { env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { randomToken, seal } from '../../lib/crypto.js';
import { NotFoundError } from '../../lib/errors.js';
import { newestFirst, pageArgs, toPage, type PaginationQuery } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { assertSafeUrl } from '../../lib/ssrf.js';
import { webhookQueue } from '../../queue/queues.js';
import { recordAudit, type AuditContext } from '../audit/service.js';
import { webhookSelect, type CreateWebhookBody, type WebhookEvent } from './schemas.js';

export async function createWebhook(input: CreateWebhookBody, ctx: AuditContext) {
  // Plain http is tolerated only for local development receivers.
  const url = await assertSafeUrl(input.url, { allowHttp: env.NODE_ENV !== 'production' });
  const secret = randomToken();
  const webhook = await prisma.$transaction(async (tx) => {
    const created = await tx.webhook.create({
      data: {
        url: url.toString(),
        events: input.events,
        secretEncrypted: seal(secret),
        createdById: ctx.actorId!,
      },
      select: webhookSelect,
    });
    await recordAudit(
      ctx,
      {
        action: 'webhook.create',
        resourceType: 'webhook',
        resourceId: created.id,
        metadata: { url: created.url },
      },
      tx,
    );
    return created;
  });
  return { ...webhook, secret };
}

export async function listWebhooks(query: PaginationQuery) {
  const rows = await prisma.webhook.findMany({
    select: webhookSelect,
    orderBy: newestFirst,
    ...pageArgs(query),
  });
  return toPage(rows, query.limit);
}

export async function deleteWebhook(id: string, ctx: AuditContext) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.webhook.deleteMany({ where: { id } });
    if (count === 0) throw new NotFoundError('Webhook');
    await recordAudit(ctx, { action: 'webhook.delete', resourceType: 'webhook', resourceId: id }, tx);
  });
}

/** Records one delivery per subscribed webhook and queues them; delivery itself happens in the worker. */
export async function dispatchWebhookEvent(event: WebhookEvent, data: Prisma.InputJsonObject) {
  const hooks = await prisma.webhook.findMany({
    where: { isActive: true, events: { has: event } },
    select: { id: true },
  });
  for (const hook of hooks) {
    const delivery = await prisma.webhookDelivery.create({
      data: { webhookId: hook.id, event, payload: { event, occurredAt: new Date().toISOString(), data } },
    });
    await webhookQueue.add('deliver', { deliveryId: delivery.id }, { jobId: delivery.id });
  }
}
