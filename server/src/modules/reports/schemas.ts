import { z } from 'zod';

export const ExportQuery = z.object({ format: z.enum(['xlsx', 'pdf']).default('pdf') });
export type ExportQuery = z.infer<typeof ExportQuery>;
