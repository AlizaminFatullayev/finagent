import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

// A caller-supplied id (e.g. from a gateway) is kept only if it is short and safe to put in logs.
const SAFE_ID = /^[\w-]{1,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
