import { z } from 'zod';

/** The only output the agent can produce. Validated before it is stored. */
export const SummarySchema = z
  .object({
    headline: z.string().min(1).max(400),
    keyMetrics: z
      .array(z.object({ label: z.string().min(1).max(200), value: z.string().min(1).max(100) }))
      .max(15),
    trends: z.array(z.string().max(500)).max(10),
    risks: z.array(z.string().max(500)).max(10),
    anomalyHighlights: z
      .array(z.object({ anomalyId: z.string().regex(/^A\d+$/), comment: z.string().min(1).max(500) }))
      .max(15),
    recommendations: z.array(z.string().max(500)).max(10),
    caveats: z.array(z.string().max(500)).max(15),
  })
  .meta({ id: 'Summary' });

export type Summary = z.infer<typeof SummarySchema>;
