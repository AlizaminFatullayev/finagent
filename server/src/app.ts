import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { healthRouter } from './modules/health/routes.js';

/** Builds the Express app without listening, so tests can drive it in-process with Supertest. */
export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);

  // Request id first, so every later log line and error body can reference it.
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      // Probes run every few seconds and would drown out real traffic.
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  // JSON bodies are small control messages; files go through multipart with their own limit.
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
