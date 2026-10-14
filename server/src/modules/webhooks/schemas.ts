import { z } from 'zod';

export const WEBHOOK_EVENTS = ['analysis.completed', 'analysis.failed'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const CreateWebhookBody = z.object({
  url: z.string().max(2048).meta({ example: 'https://hooks.example.com/finagent' }),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1)
    .default([...WEBHOOK_EVENTS]),
});
export type CreateWebhookBody = z.infer<typeof CreateWebhookBody>;

export const WebhookIdParams = z.object({ id: z.uuid() });

export const WebhookSchema = z
  .object({
    id: z.uuid(),
    url: z.string(),
    events: z.array(z.string()),
    isActive: z.boolean(),
    createdById: z.uuid(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Webhook' });

export const CreatedWebhookSchema = WebhookSchema.extend({
  secret: z.string().meta({ description: 'HMAC signing secret. Shown only once, at creation.' }),
}).meta({ id: 'CreatedWebhook' });

export const webhookSelect = {
  id: true,
  url: true,
  events: true,
  isActive: true,
  createdById: true,
  createdAt: true,
} as const;
