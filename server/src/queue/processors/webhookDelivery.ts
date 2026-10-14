import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { unseal } from '../../lib/crypto.js';
import { prisma } from '../../lib/prisma.js';
import { safeLookup } from '../../lib/ssrf.js';
import { signPayload } from '../../modules/webhooks/signing.js';

const TIMEOUT_MS = 10_000;

export type Transport = (url: string, body: string, headers: Record<string, string>) => Promise<number>;

/**
 * POSTs JSON and resolves with the status code. Redirects are not followed (a redirect to an
 * internal host would bypass the SSRF check) and DNS is resolved through safeLookup.
 */
export const postJson: Transport = (url, body, headers) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(
      target,
      {
        method: 'POST',
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Webhook request timed out')));
    req.on('error', reject);
    req.end(body);
  });

/** Delivers one webhook. Throws on failure so BullMQ retries with exponential backoff. */
export async function processWebhookDelivery(
  deliveryId: string,
  isLastAttempt: boolean,
  transport: Transport = postJson,
) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (!delivery || delivery.status === 'SUCCESS') return;

  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  let status = 0;
  let error: string | null = null;
  try {
    status = await transport(delivery.webhook.url, body, {
      'x-finagent-event': delivery.event,
      'x-finagent-delivery': delivery.id,
      'x-finagent-timestamp': String(timestamp),
      'x-finagent-signature': signPayload(unseal(delivery.webhook.secretEncrypted), timestamp, body),
    });
    if (status < 200 || status >= 300) error = `Receiver responded with ${status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Delivery failed';
  }

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      attempts: { increment: 1 },
      responseStatus: status || null,
      error,
      status: error ? (isLastAttempt ? 'FAILED' : 'PENDING') : 'SUCCESS',
      deliveredAt: error ? null : new Date(),
    },
  });
  if (error) throw new Error(error);
}
