import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '../lib/errors.js';

type Schemas = { params?: ZodType; query?: ZodType; body?: ZodType };

/**
 * Validates and coerces request parts. All failing parts are reported together (422)
 * so a client can fix every field in one round trip.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const issues: { location: string; path: string; message: string }[] = [];
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({ location: part, path: issue.path.join('.'), message: issue.message });
        }
        continue;
      }
      // Express 5 exposes req.query as a prototype getter, so the parsed value is pinned on the instance.
      Object.defineProperty(req, part, {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next(issues.length ? new ValidationError(issues) : undefined);
  };
}
