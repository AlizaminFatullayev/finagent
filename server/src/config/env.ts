import { existsSync } from 'node:fs';
import { z } from 'zod';

// Local dev keeps one .env at the repo root; containers and CI inject env vars directly,
// and tests pin their own values in vitest.config.ts, so the file is only a convenience.
const rootEnvFile = new URL('../../../.env', import.meta.url);
if (process.env.NODE_ENV !== 'test' && existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const int = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: int(3000),
    // Number of reverse proxies in front of the API; 0 means client IPs come from the socket, which
    // stops callers from spoofing X-Forwarded-For to dodge rate limits.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DATABASE_URL: z.url(),
    REDIS_URL: z.url().default('redis://localhost:6379'),

    // Short secrets make HMAC-signed tokens brute-forceable.
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: int(7),
    LOGIN_MAX_ATTEMPTS: int(5),
    LOGIN_LOCKOUT_MINUTES: int(15),

    // AES-256-GCM needs exactly 32 key bytes; anything else would fail at first encryption, far from the cause.
    MASKING_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded'),

    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),

    LLM_PROVIDER: z.enum(['anthropic', 'mock']).default('anthropic'),
    LLM_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
    ANTHROPIC_API_KEY: z.string().optional(),
    LLM_TIMEOUT_MS: int(60_000),
    LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
    AGENT_MAX_ITERATIONS: int(8),

    UPLOAD_MAX_BYTES: int(20 * 1024 * 1024),
    UPLOAD_MAX_UNCOMPRESSED_BYTES: int(200 * 1024 * 1024),
    UPLOAD_MAX_SHEETS: int(20),
    UPLOAD_MAX_ROWS: int(200_000),
    STORAGE_DIR: z.string().default('./storage'),

    ANOMALY_THRESHOLD_AMOUNT: z.coerce.number().positive().default(10_000),

    RATE_LIMIT_GLOBAL_MAX: int(300),
    RATE_LIMIT_AUTH_MAX: int(20),
    RATE_LIMIT_ANALYSIS_MAX: int(30),
    RATE_LIMIT_UNMASK_MAX: int(30),

    // Roles allowed to reveal masked PII (always limited to files they can already see). Empty disables reveal.
    UNMASK_ALLOWED_ROLES: z
      .string()
      .default('ANALYST,MANAGER,ADMIN')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.enum(['ANALYST', 'MANAGER', 'ADMIN']))),

    QUEUE_CONCURRENCY_INGEST: int(2),
    QUEUE_CONCURRENCY_ANALYZE: int(2),
    QUEUE_CONCURRENCY_WEBHOOK: int(5),
  })
  .superRefine((env, ctx) => {
    // Without a key the first analysis would fail at runtime; fail at boot instead.
    if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'required when LLM_PROVIDER=anthropic',
      });
    }
    // Copying .env.example into production must not silently ship known secrets.
    if (env.NODE_ENV === 'production') {
      const decodedKey = Buffer.from(env.MASKING_KEY, 'base64').toString('utf8');
      for (const [key, value] of [
        ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
        ['MASKING_KEY', decodedKey],
      ] as const) {
        if (value.includes('change-me')) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'placeholder secret is not allowed in production',
          });
        }
      }
    }
  });

export type Env = z.infer<typeof schema>;

/** Parses env vars and throws one readable error listing every problem. Exported for tests. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
