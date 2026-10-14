import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { analysesRouter, fileAnalysesRouter } from './modules/analyses/routes.js';
import { auditRouter } from './modules/audit/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { filesRouter } from './modules/files/routes.js';
import { healthRouter } from './modules/health/routes.js';
import { usersRouter } from './modules/users/routes.js';

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

  // Probes are mounted before the limiter so orchestrators can never be rate limited.
  app.use(healthRouter);
  app.use(globalLimiter);

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/files/:id/analyses', fileAnalysesRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/analyses', analysesRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
