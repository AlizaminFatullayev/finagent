import type { Response } from 'express';

/** Writes the standard success envelope `{ data, meta }`. */
export function send(res: Response, data: unknown, options: { status?: number; meta?: object } = {}) {
  res.status(options.status ?? 200).json({ data, meta: options.meta ?? {} });
}
