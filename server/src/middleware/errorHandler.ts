import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  PayloadTooLargeError,
  ValidationError,
} from '../lib/errors.js';

/** Maps known library errors to AppErrors; everything unknown becomes an opaque 500. */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new ValidationError(err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? new PayloadTooLargeError('File is too large')
      : new BadRequestError(err.message);
  }
  // body-parser tags its errors with `type`; these are client mistakes, not server faults.
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.too.large') return new PayloadTooLargeError('Request body is too large');
  if (type === 'entity.parse.failed') return new BadRequestError('Malformed JSON body');
  return new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);
  // Only unexpected failures are logged with a stack; 4xx are normal client behaviour.
  if (appError.status >= 500) req.log.error({ err }, 'request failed');
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details ?? null,
      requestId: req.id,
    },
  });
};

export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
};
