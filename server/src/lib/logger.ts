import { pino, type DestinationStream, type LevelWithSilent } from 'pino';
import { env } from '../config/env.js';

// Anything that could carry a credential is redacted before it reaches log storage.
export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
];

/** The destination is injectable so tests can capture the real configuration's output in memory. */
export function createLogger(level: LevelWithSilent = env.LOG_LEVEL, destination?: DestinationStream) {
  return pino(
    { level, redact: { paths: redactPaths, censor: '[REDACTED]' }, base: { service: 'finagent' } },
    destination,
  );
}

export const logger = createLogger();
